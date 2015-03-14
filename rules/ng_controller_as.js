module.exports = function(context) {

    'use strict';

    var utils = require('./utils/utils');

    function report(stmt) {
        context.report(stmt, "You should not set properties on $scope in controllers. Use controllerAs syntax and add data to 'this'");
    }

    function checkStatementsForScopeUsage (stmt) {
        /* blocks */
        if (stmt.type === 'BlockStatement') {
            stmt.body.forEach(checkStatementsForScopeUsage);
        }
        if (stmt.type === 'WhileStatement' || stmt.type === 'FunctionDeclaration') {
            checkStatementsForScopeUsage(stmt.body);
        }
        //covers if/else statements
        if (stmt.consequent) {
            checkStatementsForScopeUsage(stmt.consequent);
        }
        if (stmt.alternate) {
            checkStatementsForScopeUsage(stmt.alternate);
        }

        /* functions */
        //covers var something = function () { ... }
        if (stmt.type === 'VariableDeclaration') {
            stmt.declarations.forEach(function (dec) {
                if (dec.init.type === 'FunctionExpression') {
                    dec.init.body.body.forEach(checkStatementsForScopeUsage);
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
        if (func) {
            checkStatementsForScopeUsage(func.body);
        }
    }

    function findIdentiferInScope(identifier) {
        var identifierNode = null;
        context.getScope().variables.forEach(function (variable) {
            if (variable.name === identifier.name) {
                identifierNode = variable.defs[0].node;
            }
        });
        return identifierNode;
    }

    var exports = {};


    //Typical usage: find controller function from Angular controller() call
    if (!context.options[0]) {
        exports['CallExpression:exit'] = function(node) {
            var controllerArg = null;

            if(utils.isAngularControllerDeclaration(node)) {
                controllerArg = node.arguments[1];

                //Three ways of creating a controller function: function expression,
                //variable name that references a function, and an array with a function
                //as the last item
                if (utils.isFunctionType(controllerArg)) {
                    checkController(controllerArg);
                } else if (utils.isArrayType(controllerArg)) {
                    controllerArg = controllerArg.elements[controllerArg.elements.length - 1];
                    if (utils.isIdentifierType(controllerArg)) {
                        checkController(findIdentiferInScope(controllerArg));
                    } else {
                        checkController(controllerArg);
                    }
                }
                else if (utils.isIdentifierType(controllerArg)) {
                    checkController(findIdentiferInScope(controllerArg));
                }

            }
        }
    //This option finds controller functions based on function name, rather than Angular boilerplate
    //Useful for Browserify/CommonJS Angular code
    } else {
        var controllerNameMatcher = context.options[0];
        if (utils.isStringRegexp(controllerNameMatcher)) {
            controllerNameMatcher = new RegExp(controllerNameMatcher);
        }

        exports['FunctionExpression'] = function (node) {
            if (node.id && controllerNameMatcher.test(node.id.name)) {
                checkController(node);
            }
        };
    }

    return exports;

};
