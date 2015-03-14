module.exports = function(context) {

    'use strict';

    var utils = require('./utils/utils');

    /* We're going to build a tree of functions with the bad uses of $scope in each.
    * Then we can recursively collect those bad uses and check to see if they're used inside
    * a controller function.
    * */

    var root = {
        parent: null,
        func: {},
        children: [],
        badStatements: []
    };
    var currentNode = root;
    var controllerFunctions = [];

    //If your Angular code is written so that controller functions are in
    //separate files from your .controller() calls, you can specify a regex for your controller function names
    var controllerNameMatcher = context.options[0];
    if (controllerNameMatcher && utils.isStringRegexp(controllerNameMatcher)) {
        controllerNameMatcher = new RegExp(controllerNameMatcher);
    }

    //functions are nodes in our tree, so create a new node when we hit one
    function startFunction (func) {
        var node = {
            parent: currentNode,
            func: func,
            children: [],
            badStatements: []
        };
        currentNode.children.push(node);
        currentNode = node;
    }

    //go back up the tree when we're done with a function
    function endFunction (func) {
        currentNode = currentNode.parent;
    }

    //at the end, traverse the tree and find any bad $scope uses in each function
    function reportBadUses(node) {
        var badStatements = node.badStatements;
        if (node.children.length > 0) {
            node.children.forEach(function (childNode) {
                badStatements = badStatements.concat(reportBadUses(childNode));
            });
        }
        if ((controllerNameMatcher && node.func.id && controllerNameMatcher.test(node.func.id.name)) ||
            controllerFunctions.indexOf(node.func) >= 0) {
            badStatements.forEach(function (stmt) {
                context.report(stmt, "You should not set properties on $scope in controllers. Use controllerAs syntax and add data to 'this'");
            });
            return [];
        }
        return badStatements;
    }

    function findIdentiferInScope(identifier) {
        var identifierNode = null;
        context.getScope().variables.forEach(function (variable) {
            if (variable.name === identifier.name) {
                identifierNode = variable.defs[0].node
                if (identifierNode.type === 'VariableDeclarator') {
                    identifierNode = identifierNode.init;
                }
            }
        });
        return identifierNode;
    }

    return {
        //Looking for .controller() calls here and getting the associated controller function
        'CallExpression:exit': function(node) {
            var controllerArg = null;

            if(utils.isAngularControllerDeclaration(node)) {
                controllerArg = node.arguments[1];

                //Three ways of creating a controller function: function expression,
                //variable name that references a function, and an array with a function
                //as the last item
                if (utils.isFunctionType(controllerArg)) {
                    controllerFunctions.push(controllerArg);
                } else if (utils.isArrayType(controllerArg)) {
                    controllerArg = controllerArg.elements[controllerArg.elements.length - 1];

                    if (utils.isIdentifierType(controllerArg)) {
                        controllerFunctions.push(findIdentiferInScope(controllerArg));
                    } else {
                        controllerFunctions.push(controllerArg);
                    }
                }
                else if (utils.isIdentifierType(controllerArg)) {
                    controllerFunctions.push(findIdentiferInScope(controllerArg));
                }

            }
        },
        //statements are checked here for bad uses of $scope
        'ExpressionStatement': function (stmt) {
            if (stmt.expression.type === 'AssignmentExpression' &&
                stmt.expression.left.object &&
                stmt.expression.left.object.name === '$scope' &&
                utils.scopeProperties.indexOf(stmt.expression.left.property.name) < 0) {
                currentNode.badStatements.push(stmt);
            } else if (stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.object &&
                stmt.expression.callee.object.name === '$scope' &&
                utils.scopeProperties.indexOf(stmt.expression.callee.property.name) < 0) {
                currentNode.badStatements.push(stmt);
            }
        },
        //we've built our function tree and recorded our controllers, so now we can report
        'Program:exit': function () {
            reportBadUses(root);
        },
        //tree building hooks
        'FunctionExpression': startFunction,
        'FunctionDeclaration': startFunction,
        'FunctionExpression:exit': endFunction,
        'FunctionDeclaration:exit': endFunction
    }
};