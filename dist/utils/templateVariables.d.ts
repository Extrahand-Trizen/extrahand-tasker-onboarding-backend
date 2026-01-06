/**
 * Built-in variables available in all email templates
 */
export interface BuiltInVariable {
    name: string;
    description: string;
    example: string;
    category: 'user' | 'task' | 'lead' | 'system';
}
export declare const BUILT_IN_VARIABLES: Record<string, BuiltInVariable>;
/**
 * Get all built-in variables grouped by category
 */
export declare function getBuiltInVariablesByCategory(): Record<string, BuiltInVariable[]>;
/**
 * Get all built-in variable names
 */
export declare function getAllBuiltInVariableNames(): string[];
/**
 * Check if a variable name is a built-in variable
 */
export declare function isBuiltInVariable(variableName: string): boolean;
//# sourceMappingURL=templateVariables.d.ts.map