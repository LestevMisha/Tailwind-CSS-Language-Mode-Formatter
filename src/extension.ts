import * as vscode from 'vscode';
import { css_beautify } from 'js-beautify'; // Import css_beautify for formatting
import CleanCSS from 'clean-css'; // Import CleanCSS for minification

export function activate(context: vscode.ExtensionContext) {
    console.log("Tailwind CSS Formatter Extension Activated");

    const provider = vscode.languages.registerDocumentFormattingEditProvider('tailwindcss', {
        provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
            const edits: vscode.TextEdit[] = [];
            const text = document.getText();
            const config = vscode.workspace.getConfiguration('tailwind-css-language-mode-formatter');
            const style = config.get<string>('formatStyle', 'regular'); // Default to regular style

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
    const useTabs = config.get<boolean>('useTabs', false);
    const indentSize = config.get<number>('indentSize', 2);

    const beautifyOptions = {
        indent_size: useTabs ? 1 : indentSize, // `indent_size` must be 1 when using tabs
        indent_char: useTabs ? '\t' : ' ', // Use tabs or spaces
        preserve_newlines: true,
        max_preserve_newlines: style === 'regular' ? 2 : 1,
        space_around_combinator: true,
    };

    switch (style) {
        case 'minimized':
            return new CleanCSS({}).minify(text).styles; // Minify CSS
        case 'regular':
        default:
            return css_beautify(text, beautifyOptions);
    }
}

export function deactivate() { }
