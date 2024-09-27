# -*- coding: utf-8 -*-
# from odoo import http


# class ShopfloorCustom(http.Controller):
#     @http.route('/shopfloor_custom/shopfloor_custom', auth='public')
#     def index(self, **kw):
#         return "Hello, world"

#     @http.route('/shopfloor_custom/shopfloor_custom/objects', auth='public')
#     def list(self, **kw):
#         return http.request.render('shopfloor_custom.listing', {
#             'root': '/shopfloor_custom/shopfloor_custom',
#             'objects': http.request.env['shopfloor_custom.shopfloor_custom'].search([]),
#         })

#     @http.route('/shopfloor_custom/shopfloor_custom/objects/<model("shopfloor_custom.shopfloor_custom"):obj>', auth='public')
#     def object(self, obj, **kw):
#         return http.request.render('shopfloor_custom.object', {
#             'object': obj
#         })
