module.exports = function(context) {

    'use strict';

    var utils = require('./utils/utils');

    function report(stmt) {
        context.report(stmt, "You should not set properties on $scope in controllers. Use controllerAs syntax and add data to 'this'");
    }

    function checkStatementsForScope (stmt) {
        /* blocks */
        if (stmt.type === 'BlockStatement') {
            stmt.body.forEach(checkStatementsForScope);
        }
        if (stmt.type === 'WhileStatement' || stmt.type === 'FunctionDeclaration') {
            checkStatementsForScope(stmt.body);
        }
        //covers if/else statements
        if (stmt.consequent) {
            checkStatementsForScope(stmt.consequent);
        }
        if (stmt.consequent || stmt.alternate) {
            checkStatementsForScope(stmt.alternate);
        }

        /* functions */
        //covers var something = function () { ... }
        if (stmt.type === 'VariableDeclaration') {
            stmt.declarations.forEach(function (dec) {
                if (dec.init.type === 'FunctionExpression') {
                    dec.init.body.body.forEach(checkStatementsForScope);
                }
            });
        }

        /* statements */
        //covers $scope.func() and $scope.prop = x
        if (stmt.type === 'ExpressionStatement') {
            if (stmt.expression.type === 'AssignmentExpression' &&
                stmt.expression.left.object.name === '$scope' &&
                utils.scopeProperties.indexOf(stmt.expression.left.property.name) < 0) {
                report(stmt);
            } else if (stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.object.name === '$scope' &&
                utils.scopeProperties.indexOf(stmt.expression.callee.property.name) < 0) {
                report(stmt);
            }

        }
    }

    function checkController (func) {
        func.body.body.forEach(checkStatementsForScope);
    }

    return {
        'CallExpression:exit': function(node) {
            var callee = node.callee;

            if(callee.type === 'MemberExpression' && callee.property.name === 'controller') {
                context.getScope().variables.forEach(function (variable) {
                    if (variable.name === node.arguments[1].name) {
                        checkController(variable.defs[0].node);
                    }
                });
            }
        }
    };

};
