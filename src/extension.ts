import * as vscode from "vscode";
import CleanCSS from "clean-css"; // css minification library
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
    let fromattedText = text;
    
    switch (style) {
        case "minimized":
            fromattedText = new CleanCSS({}).minify(text).styles; // Minify CSS
        case "regular":
        default:
            fromattedText = cssbeautify(text, {
                indent: useTabs ? "\t" : " ".repeat(indentSize),
                openbrace: openBracePlacement,
                autosemicolon: useAutoSemicolon,
            });
    }

    fromattedText = formatWithUnspacedColons(fromattedText);

    // Sort classes and variants if enabled
    if (autoClassSorting) {
        return sortClassesAndVariants(fromattedText, context);
    }
    return fromattedText;
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

function sortClassesAndVariants(text: string, context: vscode.ExtensionContext): string {

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

    const sortClassesAndVariantsInLine = (classString: string): string => {
        const classArray = classString.split(/\s|;/).filter(Boolean);
            
        // variants separated
        let variants = classArray.filter((class_) => {
            const match = class_.match(/\w+(?=:)/g);
            return match && variantsList.includes(match[0]);
        });
        // sorting variants
        if (variants.length >= 2) {
            variants.sort((a, b) => variantsList.indexOf(a.match(/\w+(?=:)/g)![0]) - variantsList.indexOf(b.match(/\w+(?=:)/g)![0]));
        }

        // classes separated
        const classes = classArray.filter((class_) => !variants.includes(class_));
        // sorting classes
        if (classes.length >= 2) {
            classes.sort((a, b) => classesList.indexOf(a) - classesList.indexOf(b));
        }

        return classes.concat(variants).join(" ");
    };

    return text
        .split("\n")
        .map((line) => {
            if (/@apply\s(.*;)/g.test(line)) {
                return line.replace(/@\w+\s(.*;)/g, (match, classList) => {
                    return `@apply ${sortClassesAndVariantsInLine(classList)};`;
                });
            }
            return line;
        }).join("\n");
}

export function deactivate() { }
