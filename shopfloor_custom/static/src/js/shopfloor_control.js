odoo.define('shopfloor_control.ShopFloorControl', function (require) {
    "use strict";

    const AbstractAction = require('web.AbstractAction');
    const core = require('web.core');
    const Dialog = require('web.Dialog');
    const { Component } = owl;
    const { mount } = owl;
    const { useState } = owl.hooks;
    const { xml } = owl.tags;
    const rpc = require('web.rpc');
    const session = require('web.session'); 

    /**
     * Utility function to format the duration into minute:second format
     */
    function formatDuration(durationInMinutes) {
        const totalSeconds = Math.round(durationInMinutes * 60);  // Convert minutes to total seconds
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;  // Format with leading zeros if needed
    }

    // Define the OWL component for ShopFloorControl
    class ShopFloorControlComponent extends Component {
        setup() {
            this.state = useState({
                workorders: [],
                operators: [],
                selectedOperatorId: null,
                employee_id: null,
                searchQuery: '',
                progress: 0,
                issue: '',
                scrap: 0,
                material: 0,
            });
            this.timerIntervals = {}; // Store intervals for real-time updates
            this.workorderStartTimes = {}; // Store the start times locally
            this.loadOperators();  // Fetch the list of all operators
            this.loadEmployeeId();  // Fetch the employee_id and then load work orders
        }

        get filteredWorkorders() {
            const query = this.state.searchQuery.trim().toLowerCase();
            if (!query) {
                return this.state.workorders;
            }
            return this.state.workorders.filter((workorder) => {
                const nameToCheck = workorder.production_name + '-' + workorder.name;

                return nameToCheck.toLowerCase().includes(query);
            });
        }

        /**
         * Event handler for search keydown event.
         * It checks if Enter is pressed and then updates the search results.
         */
        onSearchKeydown(event) {
            if (event.key === "Enter") { // Check if the Enter key is pressed
                this.state.searchQuery = event.target.value; // Update the search query state
                event.preventDefault(); // Prevent form submission or other default behavior
            }
        }

        /**
         * Fetch the list of operators
         */
        async loadOperators() {
            const operators = await rpc.query({
                model: 'hr.employee',
                method: 'search_read',
                fields: ['id', 'name'],
            });
            this.state.operators = operators;

            // If an operator is selected by default, set it as the selected operator
            if (this.state.employee_id) {
                this.state.selectedOperatorId = this.state.employee_id;
            }
        }

        /**
         * Fetch the current user's employee_id from the 'res.users' model
         */
        async loadEmployeeId() {
            const user = await rpc.query({
                model: 'res.users',
                method: 'search_read',
                domain: [['id', '=', this.env.session.uid]],  // Get current user's record
                fields: ['employee_id']
            });

            if (user.length && user[0].employee_id) {
                this.state.employee_id = user[0].employee_id[0];  // Assign the employee_id to the state
                this.state.selectedOperatorId = this.state.employee_id;
                this.loadWorkOrders();  // Load work orders once we have the employee_id
            } else {
                console.error('Employee ID not found for current user');
            }
        }

        /**
         * Change operator when selected from the dropdown
         */
        changeOperator(event) {
            const selectedOperatorId = event.target.value;
            this.state.selectedOperatorId = parseInt(selectedOperatorId, 10);  // Update selected operator
            this.loadWorkOrders();  // Load work orders for the newly selected operator
        }

        /**
         * Filter work orders based on the button clicked (all or in progress)
         */
        filterWorkOrders(filterType) {
            if (filterType === 'all') {
                this.loadAllWorkOrders();  // Load all work orders when "All MO" is clicked
            } else if (filterType === 'in_progress') {
                this.loadWorkOrders();  // Reload only in-progress work orders (default view)
            }
        }


        /**
         * Load all work orders for the operator using employee_id (when "All MO" is clicked)
         */
        async loadAllWorkOrders() {
            if (!this.state.employee_id) return;

            // Fetch all work orders without filtering by state
            const workorders = await rpc.query({
                model: 'mrp.workorder',
                method: 'search_read',
                domain: [
                        ['operator_id', '=', this.state.selectedOperatorId],
                        //['production_state','in',['confirmed','progress','to_close']]
                    ],
                fields: ['name','production_name','state', 'work_progress', 'scrap_count', 'material_usage', 'production_id','duration']
            });

            // Fetch the state of the related mrp.production for each workorder
            for (let workorder of workorders) {
                const production = await rpc.query({
                    model: 'mrp.production',
                    method: 'search_read',
                    domain: [['id', '=', workorder.production_id[0]]],
                    fields: ['state']
                });

                // Append the production state to the workorder object
                workorder.production_state = production.length ? production[0].state : '';
                workorder.formatted_duration = formatDuration(workorder.duration);

            }

            this.state.workorders = workorders;  // Update the local state with the fetched work orders
        }


        /**
         * Load only in-progress work orders for the operator using employee_id (default view)
         */
        async loadWorkOrders() {
            if (!this.state.employee_id) return;

            // By default, filter only in-progress work orders
            const result = await rpc.query({
                model: 'mrp.workorder',
                method: 'search_read',
                domain: [
                    ['operator_id', '=', this.state.selectedOperatorId],
                    ['production_state', 'in', ['confirmed','progress','to_close']],
                ],  // Filter only in-progress work orders
                fields: ['name','production_name', 'state', 'work_progress', 'scrap_count', 'material_usage', 'production_id','duration','is_user_working']
            });

            // Fetch the state of the related mrp.production for each workorder
            for (let workorder of result) {
                const production = await rpc.query({
                    model: 'mrp.production',
                    method: 'search_read',
                    domain: [['id', '=', workorder.production_id[0]]],
                    fields: ['state']
                });

                // If the work order is in progress, start the timer from the existing duration
                if (workorder.state === 'progress' && workorder.is_user_working) {
                    this.startTimer(workorder);
                }        

                // Append the production state to the workorder object
                workorder.production_state = production.length ? production[0].state : '';
                workorder.formatted_duration = formatDuration(workorder.duration);
            }

            this.state.workorders = result;  // Update the local state with the fetched work orders
        }


        /**
         * Start (Play) a work order
         */
        async playWorkOrder(workorder) {
            try {
                await rpc.query({
                    model: 'mrp.workorder',
                    method: 'button_start',
                    args: [[workorder.id]]
                });

                this.startTimer(workorder);

                this.loadWorkOrders();  // Reload work orders after starting one
            } catch (error) {
                this.showErrorDialog('Error starting work order', error);
            }
        }

        /**
         * Pause a work order
         */
        async pauseWorkOrder(workorder) {
            try {
                await rpc.query({
                    model: 'mrp.workorder',
                    method: 'button_pending',
                    args: [[workorder.id]]
                });

                // Clear the interval and store the paused duration
                clearInterval(this.timerIntervals[workorder.id]);
                this.timerIntervals[workorder.id] = null;

                this.loadWorkOrders();  // Reload work orders after pausing
            } catch (error) {
                this.showErrorDialog('Error pausing work order', error);
            }
        }


        /**
         * Start the selected work order
         */
        async startWorkOrder(workorder) {
            try {
                await rpc.query({
                    model: 'mrp.workorder',
                    method: 'action_start_workorder',
                    args: [[workorder.id]]
                });
                this.loadWorkOrders();  // Reload work orders after starting one
            } catch (error) {
                this.showErrorDialog('Error starting work order', error.message.data);
            }
        }

        /**
         * Complete the selected work order
         */
        async completeWorkOrder(workorder) {
            try {
                await rpc.query({
                    model: 'mrp.workorder',
                    method: 'button_finish',
                    args: [[workorder.id]]
                });

                clearInterval(this.timerIntervals[workorder.id]);
                this.timerIntervals[workorder.id] = null;

                this.loadWorkOrders();  // Reload work orders after completing one
            } catch (error) {
                this.showErrorDialog('Error completing work order', error.message.data);
            }
        }

        /**
         * Show the worksheet for the selected work order in a popup
         */
        async showWorksheet(workorder) {
            try {
                const action = await rpc.query({
                    model: 'mrp.workorder',
                    method: 'action_open_worksheet_wizard',
                    args: [[workorder.id]]
                });

                 // Use the do_action method inherited from AbstractAction
                this.props.parent.do_action(action);
            } catch (error) {
                this.showErrorDialog('Error loading worksheet', error);
            }
        }
        
        // Utility function to display popup dialogs with numeric validation
        showPopupDialog(title, placeholder, callback, isNumeric = false) {
            let inputVal = '';
            const inputField = $('<input type="text" class="form-control" placeholder="' + placeholder + '">');

            if (isNumeric) {
                inputField.attr("type", "number").attr("step", "any");
            }

            inputField.on('input', function (e) {
                inputVal = e.target.value;
                if (isNumeric) {
                    const regex = /^-?\d*(\.\d+)?$/;
                    if (!regex.test(inputVal) && inputVal !== '') {
                        inputField.addClass("is-invalid");
                    } else {
                        inputField.removeClass("is-invalid");
                    }
                }
            });

            new Dialog(this, {
                title: title,
                size: 'medium',
                buttons: [
                    {
                        text: 'Save',
                        classes: 'btn-primary',
                        close: true,
                        click: function () {
                            if (isNumeric && (isNaN(parseFloat(inputVal)) || inputVal === '')) {
                                alert('Please enter a valid number');
                            } else {
                                callback(inputVal);
                            }
                        }
                    },
                    {
                        text: 'Cancel',
                        close: true
                    }
                ],
                $content: inputField
            }).open();
        }
        

        showMegaMenu(workorder) {
            const content = $('<div class="list-group"></div>');

            // Create buttons inside the content div
            const logProgressButton = $('<button type="button" class="list-group-item list-group-item-action">Log Progress</button>');
            const reportIssueButton = $('<button type="button" class="list-group-item list-group-item-action">Report Issue</button>');
            const recordScrapButton = $('<button type="button" class="list-group-item list-group-item-action">Record Scrap</button>');
            const recordMaterialUsageButton = $('<button type="button" class="list-group-item list-group-item-action">Record Material Usage</button>');

            // Attach button click events
            logProgressButton.on('click', () => {
                this.logProgress(workorder);
                dialog.close();  // Ensure dialog closes after the action
            });

            reportIssueButton.on('click', () => {
                this.reportIssue(workorder);
                dialog.close();  // Ensure dialog closes after the action
            });

            recordScrapButton.on('click', () => {
                this.recordScrap(workorder);
                dialog.close();  // Ensure dialog closes after the action
            });

            recordMaterialUsageButton.on('click', () => {
                this.recordMaterialUsage(workorder);
                dialog.close();  // Ensure dialog closes after the action
            });

            // Append buttons to the content div
            content.append(logProgressButton, reportIssueButton, recordScrapButton, recordMaterialUsageButton);

            // Create the dialog
            const dialog = new Dialog(this, {
                title: "What do you want to do?",
                size: 'medium',
                $content: content,  // Pass content instead of buttons array
                buttons: [  // You can still add other dialog-specific buttons if needed
                    {
                        text: 'Close',
                        close: true,
                        classes: 'btn btn-secondary',
                    }
                ]
            });

            // Open the dialog
            dialog.open();
        }




        /**
         * Log progress for a work order
         */
        logProgress(workorder) {
            this.showPopupDialog('Log Work Progress (%)', 'Enter progress percentage', async (progress) => {
                try {
                    await rpc.query({
                        model: 'mrp.workorder',
                        method: 'log_progress',
                        args: [[workorder.id], progress]
                    });
                    this.loadWorkOrders();  // Reload work orders after logging progress
                } catch (error) {
                    this.showErrorDialog('Error logging progress', error);
                }
            },true);
        }

        /**
         * Report an issue for a work order
         */
        reportIssue(workorder) {
            this.showPopupDialog('Report Issue', 'Describe the issue', async (issue) => {
                try {
                    await rpc.query({
                        model: 'mrp.workorder',
                        method: 'report_issue',
                        args: [[workorder.id], issue]
                    });
                    this.loadWorkOrders();  // Reload work orders after reporting an issue
                } catch (error) {
                    this.showErrorDialog('Error reporting issue', error);
                }
            });
        }   

        /**
         * Record scrap product for the work order
         */
        recordScrap(workorder) {
            // Fetch production and related BoM
            this._fetchProductionData(workorder).then((production) => {
                const bom_id = production.bom_id[0];
                const location_id = production.location_src_id[0];
                const production_id = production.id;

                // Fetch BoM products and display dialog
                this._fetchBomProducts(bom_id).then((bom_lines) => {
                    if (bom_lines.length) {
                        this._showScrapDialog(bom_lines, location_id, production_id);
                    } else {
                        alert('No products found in the BoM lines for this production.');
                    }
                }).catch((error) => {
                    this.showErrorDialog('Error loading BoM line products', error);
                });
            }).catch((error) => {
                this.showErrorDialog('Error loading production order', error);
            });
        }

        /**
         * Fetch production order details, including BoM and location.
         */
        _fetchProductionData(workorder) {
            return rpc.query({
                model: 'mrp.production',
                method: 'search_read',
                domain: [['id', '=', workorder.production_id[0]]],
                fields: ['bom_id', 'location_src_id', 'id']  // Get the BoM ID, location, and production ID
            }).then((productions) => productions[0]);
        }

        /**
         * Fetch BoM lines for the given BoM ID.
         */
        _fetchBomProducts(bom_id) {
            return rpc.query({
                model: 'mrp.bom.line',
                method: 'search_read',
                domain: [['bom_id', '=', bom_id]],  // Get BoM lines for the specific BoM
                fields: ['product_id']  // Get product information from BoM lines
            });
        }

        /**
         * Fetch scrap location (stock.location where scrap_location is true)
         */
        _fetchScrapLocation() {
            return rpc.query({
                model: 'stock.location',
                method: 'search_read',
                domain: [['scrap_location', '=', true]],  // Scrap locations only
                fields: ['id'],
                limit: 1
            }).then((locations) => locations[0]);
        }

        /**
         * Show a dialog allowing the user to select a product and quantity to scrap.
         */
        _showScrapDialog(bom_lines, location_id, production_id) {
            const productOptions = bom_lines.map(line => 
                `<option value="${line.product_id[0]}">${line.product_id[1]}</option>`
            ).join('');

            // Show the dialog with product and quantity fields
            new Dialog(this, {
                title: 'Scrap Product',
                size: 'medium',
                buttons: [
                    {
                        text: 'Save',
                        classes: 'btn-primary',
                        close: true,
                        click: () => this._handleSaveScrap(location_id, production_id)
                    },
                    {
                        text: 'Cancel',
                        close: true
                    }
                ],
                $content: $(`
                    <div class="form-group">
                        <label for="product-select">Select Product</label>
                        <select id="product-select" class="form-control">
                            ${productOptions}
                        </select>
                    </div>
                    <div class="form-group mt-3">
                        <label for="scrap-quantity">Scrap Quantity</label>
                        <input type="number" id="scrap-quantity" class="form-control" placeholder="Enter scrap quantity">
                    </div>
                `)
            }).open();
        }

        /**
         * Handle saving the scrap by fetching product UoM, creating stock.scrap, and validating it.
         */
        _handleSaveScrap(location_id, production_id) {
            const selectedProduct = document.getElementById('product-select').value;
            const scrapQuantity = document.getElementById('scrap-quantity').value;

            if (!selectedProduct || !scrapQuantity) {
                alert('Please select a product and enter a valid quantity.');
                return;
            }

            const company_id = session.company_id;  // Use the company ID from the session

            // Fetch UoM for the selected product
            rpc.query({
                model: 'product.product',
                method: 'read',
                args: [[parseInt(selectedProduct)], ['uom_id']]
            }).then((productData) => {
                if (productData.length && productData[0].uom_id) {
                    const uom_id = productData[0].uom_id[0];  // Extract the UoM ID

                    // Fetch scrap location before creating the scrap record
                    this._fetchScrapLocation().then((scrapLocation) => {
                        const scrap_location_id = scrapLocation.id;

                        // Create stock.scrap record
                        this._createScrapRecord(selectedProduct, scrapQuantity, location_id, scrap_location_id, uom_id, company_id, production_id)
                            .then((scrap_id) => {
                                // Validate the scrap
                                this._validateScrap(scrap_id);
                            }).catch((error) => {
                                this.showErrorDialog('Error creating scrap record', error);
                            });
                    }).catch((error) => {
                        this.showErrorDialog('Error fetching scrap location', error);
                    });
                } else {
                    this.showErrorDialog('Unit of Measure not found for selected product', {});
                }
            }).catch((error) => {
                this.showErrorDialog('Error fetching Unit of Measure', error);
            });
        }

        /**
         * Create the stock.scrap record.
         */
        _createScrapRecord(product_id, scrap_qty, location_id, scrap_location_id, uom_id, company_id, production_id) {
            return rpc.query({
                model: 'stock.scrap',
                method: 'create',
                args: [{
                    product_id: parseInt(product_id),
                    scrap_qty: parseFloat(scrap_qty),
                    location_id: location_id,
                    scrap_location_id: scrap_location_id,
                    product_uom_id: uom_id,
                    company_id: company_id,
                    production_id: production_id
                }]
            });
        }

        /**
         * Validate the stock.scrap record by calling action_validate.
         */
        _validateScrap(scrap_id) {
            rpc.query({
                model: 'stock.scrap',
                method: 'action_validate',
                args: [[scrap_id]]
            }).then(() => {
                this.loadWorkOrders();  // Reload work orders after validating the scrap
            }).catch((error) => {
                this.showErrorDialog('Error validating scrap', error);
            });
        }


      

        /**
         * Record material usage for the work order
         */
        recordMaterialUsage(workorder) {
            this.showPopupDialog('Record Material Usage', 'Enter material usage', async (material) => {
                try {
                    await rpc.query({
                        model: 'mrp.workorder',
                        method: 'record_material_usage',
                        args: [[workorder.id], material]
                    });
                    this.loadWorkOrders();  // Reload work orders after recording material usage
                } catch (error) {
                    this.showErrorDialog('Error recording material usage', error);
                }
            },true);
        }

        /**
         * Update the qty_producing field directly on the manufacturing order
         */
        async updateQtyProducing(production_id, qty) {
            try {
                await rpc.query({
                    model: 'mrp.production',
                    method: 'write',
                    args: [[production_id], { 'qty_producing': qty }]
                });
            } catch (error) {
                this.showErrorDialog('Error updating quantity to produce', error);
                throw error;  // Rethrow error if quantity update fails
            }
        }

        /**
         * Generate serial/lot numbers if required
         */
        async generateSerialNumbers(production_id) {
            try {
                await rpc.query({
                    model: 'mrp.production',
                    method: 'action_generate_serial',
                    args: [[production_id]]
                });
            } catch (error) {
                this.showErrorDialog('Error generating serial numbers', error);
                throw error;  // Rethrow error if serial generation fails
            }
        }



        /**
         * Check if the manufacturing order can be closed (state is "to_close")
         */
        async canCloseManufacturingOrder(workorder) {
            const result = await rpc.query({
                model: 'mrp.production',
                method: 'search_read',
                domain: [['id', '=', workorder.production_id[0]]],
                fields: ['state', 'qty_producing', 'product_qty', 'product_tracking']
            });

            // Check if the manufacturing order is in a state where it can be closed
            if (result.length && result[0].state === 'to_close') {
                return result[0];  // Return the production record if it can be closed
            }
            return false;
        }

        /**
         * Close the manufacturing order (mark it as done)
         */
        async closeManufacturingOrder(workorder) {
            const production = await this.canCloseManufacturingOrder(workorder);

            if (production) {
                const qtyToProduce = production.qty_producing || production.product_qty;
                
                if (qtyToProduce <= 0) {
                    alert('The quantity to produce must be positive.');
                    return;
                }

                // Update qty_producing field on the MO before closing
                await this.updateQtyProducing(production.id, qtyToProduce);

                // Generate serial/lot numbers only if product_tracking is enabled
                if (production.product_tracking === 'serial' || production.product_tracking === 'lot') {
                    await this.generateSerialNumbers(production.id);
                }

                // Mark the MO as done
                try {
                    await rpc.query({
                        model: 'mrp.production',
                        method: 'button_mark_done',
                        args: [[workorder.production_id[0]]],
                        context: { 'skip_immediate': true, 'fill_consumed':true,'skip_backorder': true, }
                    });

                    alert('Manufacturing order successfully closed.');
                    this.loadWorkOrders();  // Reload work orders after closing the manufacturing order
                } catch (error) {
                    this.showErrorDialog('Error closing manufacturing order', error.message.data);
                }
            } else {
                alert('This manufacturing order cannot be closed.');
            }
        }



        /**
         * Show error dialog with the given message and error content
         */
        showErrorDialog(title, error) {
            new Dialog(this, {
                title: title,
                size: 'medium',
                $content: $('<div>').text(error.message || 'An unknown error occurred.')
            }).open();
        }

        startTimer(workorder) {
            // Clear any existing interval for this work order (in case it was already running)
            if (this.timerIntervals[workorder.id]) {
                clearInterval(this.timerIntervals[workorder.id]);
            }

            const initialDuration = workorder.duration; // Start from the existing duration

            let elapsedSeconds = initialDuration * 60;  // Convert initial duration (in minutes) to seconds

            // Start updating the timer every second
            this.timerIntervals[workorder.id] = setInterval(() => {
                elapsedSeconds += 1;  // Increment elapsed time by 1 second

                // Find the work order and update its duration
                const updatedWorkorders = this.state.workorders.map(wo => {
                    if (wo.id === workorder.id) {
                        return {
                            ...wo,
                            formatted_duration: formatDuration(elapsedSeconds / 60)  // Convert seconds back to minutes for display
                        };
                    }
                    return wo;
                });

                // Update the state to trigger a UI update
                this.state.workorders = updatedWorkorders;
            }, 1000);  // Update every second
        }


        

    }

    // Load the QWeb template from the XML file
    ShopFloorControlComponent.template = 'ShopFloorControlTemplate';  // This is the template ID from the XML file

    // Define the Odoo AbstractAction which mounts the OWL component
    const ShopFloorControl = AbstractAction.extend({
        start: function () {
            const target = this.el; // Target element where we mount OWL component
            mount(ShopFloorControlComponent, { target, props: {parent:this} });
        }
    });

    // Register the action in Odoo's action registry
    core.action_registry.add('shopfloor_operator_interface', ShopFloorControl);

    return ShopFloorControl;
});
