import { format } from 'date-fns';
import { BUILT_IN_VARIABLES } from './templateVariables';

/**
 * Replace variables in template content with actual values
 */
export function replaceVariables(
  content: string,
  variables: Record<string, any>
): string {
  if (!content) return '';
  
  let rendered = content;
  
  // Replace all {{variableName}} patterns
  const variablePattern = /\{\{(\w+)(?:\|([^}]+))?\}\}/g;
  
  rendered = rendered.replace(variablePattern, (match, varName, modifiers) => {
    const value = variables[varName];
    
    // Handle default value modifier: {{varName|default:"defaultValue"}}
    if (modifiers && modifiers.startsWith('default:')) {
      const defaultValue = modifiers.replace(/^default:/, '').replace(/^["']|["']$/g, '');
      return value !== undefined && value !== null ? String(value) : defaultValue;
    }
    
    // Handle format modifiers
    if (modifiers) {
      return formatVariable(value, varName, modifiers);
    }
    
    // Return value or keep original if not found
    return value !== undefined && value !== null ? String(value) : match;
  });
  
  return rendered;
}

/**
 * Format variable value based on modifiers
 */
function formatVariable(value: any, varName: string, modifiers: string): string {
  if (value === undefined || value === null) return '';
  
  // Date formatting
  if (modifiers.startsWith('format:')) {
    const formatStr = modifiers.replace(/^format:/, '').replace(/^["']|["']$/g, '');
    if (value instanceof Date) {
      return format(value, formatStr);
    }
  }
  
  // Currency formatting
  if (modifiers === 'currency' || modifiers.startsWith('currency:')) {
    const amount = typeof value === 'number' ? value : parseFloat(value);
    if (!isNaN(amount)) {
      return `₹${amount.toLocaleString('en-IN')}`;
    }
  }
  
  // Uppercase
  if (modifiers === 'uppercase') {
    return String(value).toUpperCase();
  }
  
  // Capitalize
  if (modifiers === 'capitalize') {
    const str = String(value);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  
  return String(value);
}

/**
 * Extract all variables from template content
 */
export function extractVariables(content: string): string[] {
  if (!content) return [];
  
  const variablePattern = /\{\{(\w+)(?:\|[^}]+)?\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = variablePattern.exec(content)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}

/**
 * Generate plain text version from HTML
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  
  return html
    // Remove script and style tags
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Replace <br> and <p> with newlines
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // Replace <a> tags with just the text
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    // Remove all other HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Get default variable values for preview
 */
export function getDefaultVariableValues(): Record<string, any> {
  const defaults: Record<string, any> = {};
  
  Object.values(BUILT_IN_VARIABLES).forEach(variable => {
    defaults[variable.name] = variable.example;
  });
  
  // Add system defaults
  defaults.platformName = 'ExtraHand';
  defaults.currentDate = format(new Date(), 'dd MMM yyyy');
  defaults.currentYear = new Date().getFullYear().toString();
  defaults.supportEmail = 'support@extrahand.com';
  defaults.websiteUrl = 'https://extrahand.com';
  defaults.unsubscribeLink = 'https://extrahand.com/unsubscribe?token=sample-token';
  
  return defaults;
}

/**
 * Validate that all required variables are provided
 */
export function validateRequiredVariables(
  templateVariables: Array<{ name: string; required: boolean }>,
  providedVariables: Record<string, any>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  templateVariables.forEach(variable => {
    if (variable.required) {
      const value = providedVariables[variable.name];
      if (value === undefined || value === null || value === '') {
        missing.push(variable.name);
      }
    }
  });
  
  return {
    valid: missing.length === 0,
    missing
  };
}
