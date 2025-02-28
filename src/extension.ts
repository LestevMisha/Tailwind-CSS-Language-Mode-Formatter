import * as vscode from "vscode";
import cssbeautify from "cssbeautify"; // css formatting library

import fs from "fs";
import path from "path";

export function activate(context: vscode.ExtensionContext) {
    console.log("Tailwind CSS Formatter Extension Activated");

    const provider = vscode.languages.registerDocumentFormattingEditProvider("tailwindcss", {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            const edits: vscode.TextEdit[] = [];
            const text = document.getText();
            const config = vscode.workspace.getConfiguration("tailwind-css-language-mode-formatter");
            const style = config.get<string>("formatStyle", "regular"); // Default to regular style

            // Apply the correct formatting/minification style
            const formattedText = applyStyle(text, style, config, context);

            if (text !== formattedText) {
                const fullRange = new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(text.length)
                );
                edits.push(vscode.TextEdit.replace(fullRange, formattedText));
            }

            return edits;
        }
    });

    context.subscriptions.push(provider);
}

// Function to apply the selected formatting or minification style
function applyStyle(text: string, style: string, config: vscode.WorkspaceConfiguration, context: vscode.ExtensionContext): string {
    const useTabs = config.get<boolean>("useTabs", false);
    const indentSize = config.get<number>("indentSize", 2);
    const useAutoSemicolon = config.get<boolean>("useAutoSemicolon", true);
    const openBracePlacement = config.get<any>("openBracePlacement", "end-of-line"); // "end-of-line" or "separate-line"
    const autoClassSorting = config.get<boolean>("autoClassSorting", true);
    const spaceAroundSelectorSeparator = config.get<boolean>("spaceAroundSelectorSeparator", true);
    const applyMaxLineLength = config.get<number>("applyMaxLineLength", 70);
    let formattedText = text;

    switch (style) {
        case "minimized":
            // Use our custom minimizer instead of CleanCSS.
            return minimizeCss(text);
        // break;
        case "regular":
        default:
            formattedText = cssbeautify(text, {
                indent: useTabs ? "\t" : " ".repeat(indentSize),
                openbrace: openBracePlacement,
                autosemicolon: useAutoSemicolon,
            });
            // Removes extra semicolons after empty comments. (cssbeautify accidently adds semicolons after empty comments)
            formattedText = removeCommentsSemicolons(formattedText);
    }

    formattedText = formatWithUnspacedColons(formattedText);

    // Add spacing around CSS combinators (>, +, ~) in selectors
    if (spaceAroundSelectorSeparator) {
        formattedText = formatExcludingProtectedSegments(formattedText);
    }

    // Ensure proper indentation for deep nestings
    formattedText = fixNestedIndentation(formattedText, indentSize, useTabs);

    // // Sort classes and variants if enabled
    return sortClassesAndVariants(formattedText, context, useTabs, indentSize, applyMaxLineLength, autoClassSorting);
}

function fixNestedIndentation(css: string, indentSize: number, useTabs: boolean): string {

    const indentChar = useTabs ? "\t" : " ".repeat(indentSize);
    let depth = 0;

    const lines = css.split("\n");
    const formattedLines: string[] = [];


    for (let line of lines) {
        line = line.trim();

        // Decrease depth if closing bracket is at the start of the line
        if (line.startsWith("}")) {
            depth = Math.max(0, depth - 1);
        }

        // Apply correct indentation
        formattedLines.push(indentChar.repeat(depth) + line);

        // Increase depth if opening bracket is at the end of the line
        if (line.endsWith("{")) {
            depth++;
        }
    }

    const nestedCss = formattedLines.join("\n");

    // Match all property values (multi-line or single-line)
    const propertyMatches = [...nestedCss.matchAll(/(?<!:)([a-zA-Z-]+:.+,)(?:\n\s*(.+),)*\n\s*(.+)(?!\s*\{)/g)];

    // Filter only multi-line properties (values spanning multiple lines)
    const multiLineProperties = propertyMatches
        .map(match => match[0]) // Extract match content
        .filter(prop => prop.includes("\n")); // Only consider multi-line props

    let formattedCss = nestedCss;
    for (let prop of multiLineProperties) {
        // Increase indentation for each line in the multi-line property
        const indentedProp = prop
            .split("\n")
            .map((line, index) => index === 0 ? line : indentChar + line)
            .join("\n");

        formattedCss = formattedCss.replace(prop, indentedProp);
    }

    return formattedCss;
}


function formatWithUnspacedColons(text: string): string {
    return text.split("\n").map(line => {
        // If the line contains @, ensure colons remain unspaced
        if (/@.*:\s/g.test(line)) {
            return line.replace(/:\s*/g, ":"); // Remove spaces after colons in lines with @
        }
        return line; // Return line unchanged if no @ symbol
    }).join("\n");
}

/**
 * A simple CSS minimizer that:
 * - Removes CSS comments.
 * - Collapses all whitespace into single spaces.
 * - Removes extra spaces around punctuation such as braces, colons, semicolons, and commas.
 * - Removes unnecessary semicolons before closing braces.
 */
function minimizeCss(css: string): string {
    // Remove all comments.
    let minified = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Replace multiple whitespace with a single space.
    minified = minified.replace(/\s+/g, ' ');
    // Remove spaces around {, }, :, ;, and ,.
    minified = minified
        .replace(/\s*{\s*/g, '{')
        .replace(/\s*}\s*/g, '}')
        .replace(/\s*;\s*/g, ';')
        .replace(/\s*:\s*/g, ':')
        .replace(/\s*,\s*/g, ',');
    // Remove any semicolon immediately before a closing brace.
    minified = minified.replace(/;}/g, '}');
    return minified.trim();
}

function removeCommentsSemicolons(css: string): string {
    const lines = css.split("\n");
    const formattedLines: string[] = [];

    for (let rawLine of lines) {
        let line = rawLine; // keep the original line for reference
        line = line.replace(/\*\/;\s*$/gm, "*/");
        formattedLines.push(line);
    }

    return formattedLines.join("\n");
}

function formatExcludingProtectedSegments(text: string): string {
    // Regex to match the parts we want to skip formatting.
    const exclusionRegex = /:[\s\S]*?((\S+?(:|;))|})/g;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Loop over all matches of the exclusion regex.
    while ((match = exclusionRegex.exec(text)) !== null) {
        // Process text from the end of the last match to the start of this match.
        let segment = text.slice(lastIndex, match.index);
        // Add spacing around combinators in this segment.
        segment = segment
            .replace(/\s*>\s*/g, " > ")
            .replace(/\s*~\s*/g, " ~ ")
            .replace(/\s*\+\s*/g, " + ");

        result += segment;
        // Append the protected text unmodified.
        result += match[0];
        // Update lastIndex to continue after this match.
        lastIndex = exclusionRegex.lastIndex;
    }

    // Process any trailing text after the last match.
    let trailing = text.slice(lastIndex);
    trailing = trailing
        .replace(/\s*>\s*/g, " > ")
        .replace(/\s*~\s*/g, " ~ ")
        .replace(/\s*\+\s*/g, " + ");
    result += trailing;

    return result;
}



function sortClassesAndVariants(text: string, context: vscode.ExtensionContext, useTabs: boolean, indentSize: number, applyMaxLineLength: number, autoClassSorting: boolean): string {

    const classesPath = context.asAbsolutePath(path.join("resources", "classes.txt"));
    const variantsPath = context.asAbsolutePath(path.join("resources", "variants.txt"));
    let variantsList: string[] = [];
    let classesList: string[] = [];

    if (fs.existsSync(variantsPath)) {
        const variantData = fs.readFileSync(variantsPath, "utf8");
        variantsList = variantData.split(/\r?\n/).filter(Boolean); // Load and filter empty lines
    }
    if (fs.existsSync(classesPath)) {
        const classesData = fs.readFileSync(classesPath, "utf8");
        classesList = classesData.split(/\r?\n/).filter(Boolean); // Load and filter empty lines
    }

    const sortClassesAndVariantsInLine = (
        classString: string,
    ): string => {

        let sortedTokens: string[] = [];
        // Split on whitespace or semicolon and filter out empties.
        const classArray = classString.split(/\s|;/).filter(Boolean);
        if (autoClassSorting) {

            // Separate variant tokens (e.g. "hover:bg-sky-800") using a regex.
            let variants = classArray.filter((class_) => {
                const match = class_.match(/\w+(?=:)/g);
                return match && variantsList.includes(match[0]);
            });
            // Sort variants based on the order in variantsList.
            if (variants.length >= 2) {
                variants.sort(
                    (a, b) =>
                        variantsList.indexOf(a.match(/\w+(?=:)/g)![0]) -
                        variantsList.indexOf(b.match(/\w+(?=:)/g)![0])
                );
            }

            // The rest are regular classes.
            let classes = classArray.filter((class_) => !variants.includes(class_));
            // Sort regular classes based on classesList order.
            if (classes.length >= 2) {
                classes.sort((a, b) => classesList.indexOf(a) - classesList.indexOf(b));
            }

            // Combine the sorted tokens.
            sortedTokens = classes.concat(variants);
        } else {
            sortedTokens = classArray;
        }

        // Reflow tokens into lines, ensuring that no line exceeds maxLineLength.
        const lines: string[] = [];
        let currentLine = "";

        let checker = false;
        for (const token of sortedTokens) {
            // If currentLine is empty, start with the token.
            if (currentLine === "") {
                currentLine = token;
            } else {
                // Check if adding this token would exceed maxLineLength.
                if (currentLine.length + 1 + token.length > applyMaxLineLength) {
                    // Push the current line and start a new one.
                    if (checker) {
                        lines.push(`${useTabs ? "\t\t" : " ".repeat(indentSize * 2)}${currentLine}`);
                    } else {
                        lines.push(currentLine);
                        checker = true;
                    }
                    currentLine = token;
                } else {
                    // Append token to the current line (with a space).
                    currentLine += " " + token;
                }
            }
        }

        if (currentLine) {
            if (currentLine.includes("@apply")) {
                lines.push(currentLine);
            } else {
                lines.push(`${useTabs ? "\t\t" : " ".repeat(indentSize + 2)}${currentLine}`);
            }
        }

        return lines.join("\n");
    };

    return text.replace(/(?<!\/\*[\s\S]*?)@apply\s+([\s\S]*?);/gm, (match, classList) => {
        // Flatten the captured class list (remove newlines and extra spaces)
        const adjusted_colons = match.replace(/:\s/g, ":").trim();
        const sortedClasses = sortClassesAndVariantsInLine(adjusted_colons);
        return `${sortedClasses};`;
    });
}

export function deactivate() { }
