# -*- coding: utf-8 -*-
{
    'name': "ShopFloor Control Module",

    'summary': """
        Custom ShopFloor Control Module for Odoo""",

    'description': """
        Long description of module's purpose
    """,

    'author': "Gam Hpang",
    'website': "http://www.yourcompany.com",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/15.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Manufacturing',
    'version': '0.1',

    # any module necessary for this one to work correctly
    'depends': ['mrp','hr'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        #'views/views.xml',
        'views/workorder_view.xml',
        'views/shopfloor_operator_menu.xml',
        'views/shopfloor_operator_view.xml',
        'views/templates.xml',
    ],
    'assets': {
        'web.assets_qweb': [
            'shopfloor_custom/static/src/xml/shopfloor_template.xml',
        ],
        'web.assets_backend': [
            
            'shopfloor_custom/static/src/css/shopfloor_control.css',
            'shopfloor_custom/static/src/js/shopfloor_control.js',

        ],
    },
    'images': ['static/description/icon.png'],
    'application': True,
}
