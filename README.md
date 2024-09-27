# Custom ShopFloor Control Module for Odoo 15

## Overview
This module is a custom-built ShopFloor Control system tailored for a medical device manufacturing company. It is designed to extend the functionality of the existing Odoo MRP (Manufacturing Resource Planning) module by introducing operator-specific work order management, leveraging Odoo Web Library (OWL) for the front end.

### Key Features:
- Inherits the existing MRP Order and Work Order models.
- Displays work orders assigned to operators with real-time updates.
- Designed using the OWL (Odoo Web Library) framework for improved UI/UX.
- Separate app and module structure for easy maintenance and updates.
  
## Module Structure

The custom ShopFloor Control module consists of the following key components:

1. **Models**:
   - Inherited `mrp.order` and `mrp.workorder` models.
   - Added logic to filter work orders based on operator assignments.

2. **Views**:
   - Custom views for work order management.
   - Operator-specific work order display using OWL-based UI.

3. **Controllers**:
   - Controllers to handle requests and update work order statuses dynamically for operators on the shop floor.

4. **Templates**:
   - OWL-based templates for an interactive and user-friendly work order interface.

## Installation

To install the ShopFloor Control module:

1. Download the `shopfloor` module and place it in your Odoo 15 `addons` folder.
2. Update your Odoo apps list by navigating to **Apps** > **Update Apps List** in the Odoo backend.
3. Search for `ShopFloor Control` in the Apps list and click **Install**.

## Configuration

1. **Assign Operators to Work Orders**: 
   - Navigate to the Manufacturing > Work Orders section.
   - Assign operators to work orders to ensure they only see work orders relevant to them on the ShopFloor interface.
   
2. **Work Order Visibility**:
   - Operators can log into the system and see work orders assigned to them.
   - The system provides real-time updates on work order progress, making it easy to track and manage tasks directly from the shop floor.

## Usage

1. **Operator Dashboard**:
   - After logging in, operators will see an intuitive dashboard that lists all their active and pending work orders.
   - Work order status can be updated from the dashboard with real-time feedback.

2. **Work Order Management**:
   - Managers can view, assign, and track the progress of work orders for all operators via the Manufacturing module.
   - The system supports real-time changes, ensuring that any updates made by an operator reflect instantly in the back office.

## Technical Details

- **Models**: `mrp.order`, `mrp.workorder` (Inherited and extended).
- **Frontend**: OWL (Odoo Web Library) is used for the dynamic operator work order interface.
- **Compatibility**: Odoo 15.

## Customizations

- This module can be easily extended to include additional features in the future.
