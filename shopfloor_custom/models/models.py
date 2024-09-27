# -*- coding: utf-8 -*-

from odoo import models, fields, api, _
from odoo.exceptions import AccessError, UserError

class MrpProduction(models.Model):
    _inherit = 'mrp.production'

    def button_mark_done(self):

        if self.env.context.get('fill_consumed'):
            for move in self.move_raw_ids:
                for line in move.move_line_ids:
                    if line.qty_done == 0.0:
                        line.qty_done = line.product_uom_qty

        res = super(MrpProduction,self).button_mark_done()

        return res

class MrpWorkorderInherit(models.Model):
    _inherit = 'mrp.workorder'

    production_name = fields.Char(related="production_id.name", readonly=True)
    operator_id = fields.Many2one('hr.employee', string="Operator", required=True)
    work_progress = fields.Float(string="Work Progress (%)", default=0.0)
    issues_reported = fields.Text(string="Reported Issues")
    scrap_count = fields.Integer(string="Scrap Count", default=0)
    material_usage = fields.Float(string="Material Usage", default=0.0)

    @api.model
    def default_get(self, fields):
        """
        Override default_get to set operator_id to current user's employee_id by default.
        """
        res = super(MrpWorkorderInherit, self).default_get(fields)
        user = self.env.user

        if user.employee_id:
            res['operator_id'] = user.employee_id.id

        return res

    def action_start_workorder(self):
        """Start the work order for the operator"""
        self.ensure_one()
        if self.operator_id != self.env.user.employee_id:
            raise UserError("You are not assigned to this work order.")
        self.write({'state': 'progress'})

    def log_progress(self, progress):
        """Log work progress"""
        self.ensure_one()
        self.write({'work_progress': progress})

    def report_issue(self, issue):
        """Report an issue"""
        self.ensure_one()
        self.write({'issues_reported': issue})
        self.production_id.message_post(body=_("Issue reported from %s. <br/> Reported issue: %s")%(self.name,issue))


    def record_scrap(self, scrap_count):
        """Record scrap quantity"""
        self.ensure_one()
        self.write({'scrap_count': scrap_count})

    def record_material_usage(self, material_units):
        """Record material usage"""
        self.ensure_one()
        self.write({'material_usage': material_units})

    def action_open_worksheet_wizard(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("shopfloor_custom.mrp_workorder_worksheet_form_action")
        action['res_id'] = self.id
        return action