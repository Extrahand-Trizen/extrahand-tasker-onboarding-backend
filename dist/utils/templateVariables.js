"use strict";
/**
 * Built-in variables available in all email templates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILT_IN_VARIABLES = void 0;
exports.getBuiltInVariablesByCategory = getBuiltInVariablesByCategory;
exports.getAllBuiltInVariableNames = getAllBuiltInVariableNames;
exports.isBuiltInVariable = isBuiltInVariable;
exports.BUILT_IN_VARIABLES = {
    // User Variables
    userName: {
        name: 'userName',
        description: "User's full name",
        example: 'John Doe',
        category: 'user'
    },
    userEmail: {
        name: 'userEmail',
        description: "User's email address",
        example: 'john@example.com',
        category: 'user'
    },
    userPhone: {
        name: 'userPhone',
        description: "User's phone number",
        example: '+91 9876543210',
        category: 'user'
    },
    userCity: {
        name: 'userCity',
        description: "User's city",
        example: 'Mumbai',
        category: 'user'
    },
    userState: {
        name: 'userState',
        description: "User's state",
        example: 'Maharashtra',
        category: 'user'
    },
    userRole: {
        name: 'userRole',
        description: "User's role (helper, requester, both)",
        example: 'helper',
        category: 'user'
    },
    userType: {
        name: 'userType',
        description: "User type (individual, business)",
        example: 'individual',
        category: 'user'
    },
    // Task Variables
    taskTitle: {
        name: 'taskTitle',
        description: 'Task title',
        example: 'Plumbing Repair Needed',
        category: 'task'
    },
    taskCategory: {
        name: 'taskCategory',
        description: 'Task category',
        example: 'plumbing',
        category: 'task'
    },
    taskBudget: {
        name: 'taskBudget',
        description: 'Task budget amount',
        example: '₹1,500',
        category: 'task'
    },
    taskLocation: {
        name: 'taskLocation',
        description: 'Task location (city)',
        example: 'Mumbai',
        category: 'task'
    },
    taskStatus: {
        name: 'taskStatus',
        description: 'Task status',
        example: 'assigned',
        category: 'task'
    },
    taskId: {
        name: 'taskId',
        description: 'Task ID',
        example: 'TASK-123456',
        category: 'task'
    },
    // Lead Variables
    leadName: {
        name: 'leadName',
        description: 'Lead name',
        example: 'John Doe',
        category: 'lead'
    },
    leadStatus: {
        name: 'leadStatus',
        description: 'Lead status',
        example: 'approved',
        category: 'lead'
    },
    leadCity: {
        name: 'leadCity',
        description: 'Lead city',
        example: 'Mumbai',
        category: 'lead'
    },
    leadSkill: {
        name: 'leadSkill',
        description: 'Lead primary skill',
        example: 'plumbing',
        category: 'lead'
    },
    // System Variables
    platformName: {
        name: 'platformName',
        description: 'Platform name',
        example: 'ExtraHand',
        category: 'system'
    },
    currentDate: {
        name: 'currentDate',
        description: 'Current date (formatted)',
        example: '25 Dec 2025',
        category: 'system'
    },
    currentYear: {
        name: 'currentYear',
        description: 'Current year',
        example: '2025',
        category: 'system'
    },
    supportEmail: {
        name: 'supportEmail',
        description: 'Support email address',
        example: 'support@extrahand.com',
        category: 'system'
    },
    websiteUrl: {
        name: 'websiteUrl',
        description: 'Website URL',
        example: 'https://extrahand.com',
        category: 'system'
    },
    unsubscribeLink: {
        name: 'unsubscribeLink',
        description: 'Unsubscribe URL (auto-generated)',
        example: 'https://extrahand.com/unsubscribe?token=...',
        category: 'system'
    }
};
/**
 * Get all built-in variables grouped by category
 */
function getBuiltInVariablesByCategory() {
    const categories = {
        user: [],
        task: [],
        lead: [],
        system: []
    };
    Object.values(exports.BUILT_IN_VARIABLES).forEach(variable => {
        categories[variable.category].push(variable);
    });
    return categories;
}
/**
 * Get all built-in variable names
 */
function getAllBuiltInVariableNames() {
    return Object.keys(exports.BUILT_IN_VARIABLES);
}
/**
 * Check if a variable name is a built-in variable
 */
function isBuiltInVariable(variableName) {
    return variableName in exports.BUILT_IN_VARIABLES;
}
//# sourceMappingURL=templateVariables.js.map