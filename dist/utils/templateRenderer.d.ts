/**
 * Replace variables in template content with actual values
 */
export declare function replaceVariables(content: string, variables: Record<string, any>): string;
/**
 * Extract all variables from template content
 */
export declare function extractVariables(content: string): string[];
/**
 * Generate plain text version from HTML
 */
export declare function htmlToText(html: string): string;
/**
 * Get default variable values for preview
 */
export declare function getDefaultVariableValues(): Record<string, any>;
/**
 * Validate that all required variables are provided
 */
export declare function validateRequiredVariables(templateVariables: Array<{
    name: string;
    required: boolean;
}>, providedVariables: Record<string, any>): {
    valid: boolean;
    missing: string[];
};
//# sourceMappingURL=templateRenderer.d.ts.map