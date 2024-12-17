import * as vscode from "vscode";
import CleanCSS from "clean-css"; // css minification library
import cssbeautify from "cssbeautify"; // css formatting library

export function activate(context: vscode.ExtensionContext) {
    console.log("Tailwind CSS Formatter Extension Activated");

    const provider = vscode.languages.registerDocumentFormattingEditProvider("tailwindcss", {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            const edits: vscode.TextEdit[] = [];
            const text = document.getText();
            const config = vscode.workspace.getConfiguration("tailwind-css-language-mode-formatter");
            const style = config.get<string>("formatStyle", "regular"); // Default to regular style

            // Apply the correct formatting/minification style
            const formattedText = applyStyle(text, style, config);

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
function applyStyle(text: string, style: string, config: vscode.WorkspaceConfiguration): string {
    const useTabs = config.get<boolean>("useTabs", false);
    const indentSize = config.get<number>("indentSize", 2);
    const useAutoSemicolon = config.get<boolean>("useAutoSemicolon", true);
    const openBracePlacement = config.get<any>("openBracePlacement", "end-of-line"); // "end-of-line" or "separate-line"

    switch (style) {
        case "minimized":
            return new CleanCSS({}).minify(text).styles; // Minify CSS
        case "regular":
        default:
            return cssbeautify(text, {
                indent: useTabs ? "\t" : " ".repeat(indentSize),
                openbrace: openBracePlacement,
                autosemicolon: useAutoSemicolon,
            });
    }
}

export function deactivate() { }
