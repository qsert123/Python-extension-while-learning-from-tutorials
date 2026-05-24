let pyodide = null;
let isLoading = false;

// Setup input handler
function setupInputHandler() {
    window.getUserInput = function(promptText) {
        return prompt(promptText || "Enter value:");
    };
}

// Update line numbers
function updateLineNumbers() {
    const editor = document.getElementById('code-editor');
    const lineNumbers = document.getElementById('line-numbers');
    
    if (!editor || !lineNumbers) return;
    
    const lines = editor.value.split('\n');
    const lineNumbersHTML = lines.map((_, i) => i + 1).join('\n');
    lineNumbers.textContent = lineNumbersHTML;
    lineNumbers.scrollTop = editor.scrollTop;
}

// Get current indentation of a line
function getIndentation(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
}

// Get indentation level (number of spaces)
function getIndentationLevel(line) {
    const indent = getIndentation(line);
    return indent.length;
}

// Check if a line starts a new block that needs indentation
function isBlockStarter(line) {
    const trimmed = line.trim();
    // Check for block starters
    const blockKeywords = [
        'if ', 'elif ', 'else:', 'for ', 'while ', 'def ', 'class ',
        'try:', 'except', 'finally:', 'with ', 'async def', 'async for'
    ];
    
    // Special handling for else, elif (they can be on same line as if)
    if (trimmed === 'else:' || trimmed === 'finally:') return true;
    if (trimmed.startsWith('elif ')) return true;
    if (trimmed.startsWith('except')) return true;
    
    for (const keyword of blockKeywords) {
        if (trimmed.startsWith(keyword) && trimmed.endsWith(':')) {
            return true;
        }
    }
    return false;
}

// Check if a line ends a block (decreases indentation)
function isBlockEnder(line, prevLine, nextLine) {
    const trimmed = line.trim();
    const prevTrimmed = prevLine ? prevLine.trim() : '';
    
    // Check for elif, else, except that continue the block at same level
    if (trimmed.startsWith('elif ') || trimmed === 'else:' || 
        trimmed.startsWith('except') || trimmed === 'finally:') {
        return false; // These keep same indentation level
    }
    
    // If previous line was a block starter and current line is not empty
    if (prevTrimmed && isBlockStarter(prevLine) && trimmed) {
        return false;
    }
    
    return false;
}

// Calculate proper indentation for new line
function calculateIndentation(currentLine, nextLineContent = '') {
    const trimmedCurrent = currentLine.trim();
    const currentIndent = getIndentation(currentLine);
    const currentLevel = currentIndent.length;
    
    // Case 1: Current line ends with colon - increase indentation by 4 spaces
    if (trimmedCurrent.endsWith(':')) {
        // Special case: if it's else, elif, except - they don't increase indentation
        const blockStarters = ['if ', 'elif ', 'else:', 'for ', 'while ', 'def ', 'class ',
                               'try:', 'except', 'finally:', 'with ', 'async def', 'async for'];
        
        let isBlockStarter = false;
        for (const starter of blockStarters) {
            if (trimmedCurrent.startsWith(starter)) {
                isBlockStarter = true;
                break;
            }
        }
        
        if (isBlockStarter) {
            return currentLevel + 4;
        }
    }
    
    // Case 2: Current line starts with elif, else, except - same level as previous
    if (trimmedCurrent.startsWith('elif ') || trimmedCurrent === 'else:' ||
        trimmedCurrent.startsWith('except') || trimmedCurrent === 'finally:') {
        // Find the matching if/try level
        return currentLevel;
    }
    
    // Case 3: Current line is empty or just whitespace - use same level
    if (!trimmedCurrent) {
        return currentLevel;
    }
    
    // Default: same indentation level
    return currentLevel;
}

// Get the indentation level of the previous non-empty line
function getPreviousNonEmptyIndentation(editor, currentPos) {
    const textBeforeCursor = editor.value.substring(0, currentPos);
    const lines = textBeforeCursor.split('\n');
    
    // Go backwards to find the last non-empty line
    for (let i = lines.length - 2; i >= 0; i--) {
        const line = lines[i];
        if (line.trim()) {
            return getIndentation(line);
        }
    }
    return '';
}

// Handle Enter key with smart indentation
function handleEnterKey(editor) {
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    const textAfterCursor = editor.value.substring(cursorPos);
    
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    const trimmedCurrent = currentLine.trim();
    
    // Calculate indentation for new line
    let indentSpaces = calculateIndentation(currentLine);
    
    // Special case: if current line is empty or just spaces, use previous line's indentation
    if (!trimmedCurrent) {
        const prevIndent = getPreviousNonEmptyIndentation(editor, cursorPos);
        indentSpaces = prevIndent.length;
    }
    
    const indent = ' '.repeat(indentSpaces);
    const newText = textBeforeCursor + '\n' + indent + textAfterCursor;
    editor.value = newText;
    
    const newCursorPos = cursorPos + 1 + indentSpaces;
    editor.selectionStart = editor.selectionEnd = newCursorPos;
    updateLineNumbers();
}

// Handle Tab key - insert 4 spaces
function handleTab(editor) {
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    const textAfterCursor = editor.value.substring(cursorPos);
    
    editor.value = textBeforeCursor + '    ' + textAfterCursor;
    editor.selectionStart = editor.selectionEnd = cursorPos + 4;
    updateLineNumbers();
}

// Handle Backspace key - smart backspace
function handleBackspace(editor, e) {
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    
    // Get the start of current line
    const lastNewline = textBeforeCursor.lastIndexOf('\n');
    const lineStart = lastNewline + 1;
    const lineText = textBeforeCursor.substring(lineStart);
    
    // Check if cursor is at the beginning of indentation
    const cursorInLine = cursorPos - lineStart;
    const indentationMatch = lineText.match(/^(\s*)/);
    const indentation = indentationMatch ? indentationMatch[1] : '';
    
    // If cursor is within the indentation area
    if (cursorInLine <= indentation.length && cursorInLine > 0) {
        // Remove 4 spaces at a time instead of 1
        const spacesToRemove = Math.min(4, cursorInLine);
        if (spacesToRemove > 0) {
            e.preventDefault();
            const newText = editor.value.substring(0, cursorPos - spacesToRemove) + 
                           editor.value.substring(cursorPos);
            editor.value = newText;
            editor.selectionStart = editor.selectionEnd = cursorPos - spacesToRemove;
            updateLineNumbers();
        }
    }
}

// Handle Shift+Tab - unindent by 4 spaces
function handleShiftTab(editor) {
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    
    const lastNewline = textBeforeCursor.lastIndexOf('\n');
    const lineStart = lastNewline + 1;
    const lineText = textBeforeCursor.substring(lineStart);
    
    // Check if line starts with 4 spaces
    if (lineText.startsWith('    ')) {
        const newText = editor.value.substring(0, lineStart) + 
                       editor.value.substring(lineStart + 4);
        editor.value = newText;
        editor.selectionStart = editor.selectionEnd = cursorPos - 4;
        updateLineNumbers();
    }
}

// Setup editor features
function setupEditorFeatures() {
    const editor = document.getElementById('code-editor');
    
    editor.addEventListener('scroll', () => {
        const lineNumbers = document.getElementById('line-numbers');
        if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
    });
    
    editor.addEventListener('input', updateLineNumbers);
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEnterKey(editor);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                handleShiftTab(editor);
            } else {
                handleTab(editor);
            }
        } else if (e.key === 'Backspace') {
            handleBackspace(editor, e);
        }
    });
    
    updateLineNumbers();
}

// Update status display
function updateStatus(message, type = 'loading') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }
}

// Load Pyodide
async function loadPyodideAndPackages() {
    if (isLoading) return;
    isLoading = true;
    
    updateStatus("⏳ Loading Python environment (15-20 seconds first time)...", "loading");
    
    try {
        const indexURL = chrome.runtime.getURL("lib/pyodide/");
        const lockFileURL = indexURL + "pyodide-lock.json";
        
        pyodide = await loadPyodide({
            indexURL: indexURL,
            lockFileURL: lockFileURL
        });
        
        setupInputHandler();
        
        pyodide.runPython(`
import builtins
from js import getUserInput

def custom_input(prompt=''):
    result = getUserInput(prompt)
    return str(result) if result is not None else ""

builtins.input = custom_input
print("Python ready!")
        `);
        
        updateStatus("Ready! You can now run Python code.", "ready");
        
    } catch (error) {
        console.error("Failed:", error);
        updateStatus(`Error loading Python: ${error.message}`, "error");
    } finally {
        isLoading = false;
    }
}

// Run code
async function runPythonCode() {
    const code = document.getElementById('code-editor').value;
    const outputElement = document.getElementById('output-console');
    
    if (!code.trim()) {
        outputElement.textContent = "Please enter some Python code to run.";
        return;
    }
    
    if (!pyodide) {
        outputElement.textContent = "Python is still loading. Please wait...";
        return;
    }
    
    outputElement.textContent = "Running...";
    
    try {
        await pyodide.runPythonAsync(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
        `);
        
        await pyodide.runPythonAsync(code);
        
        const stdout = pyodide.runPython("sys.stdout.getvalue()");
        const stderr = pyodide.runPython("sys.stderr.getvalue()");
        
        let result = "";
        if (stdout) result = stdout;
        if (stderr) result += (stdout ? "\n" : "") + " " + stderr;
        
        if (!result.trim()) {
            result = "Code executed successfully! (No output)";
        }
        
        outputElement.textContent = result;
        
    } catch (error) {
        let errorMsg = error.toString();
        const match = errorMsg.match(/message: (.*?)(?:\n|$)/);
        if (match) errorMsg = match[1];
        outputElement.textContent = `Error:\n${errorMsg}`;
    }
}

// Clear output
function clearOutput() {
    const outputElement = document.getElementById('output-console');
    outputElement.textContent = "Output cleared. Click Run to see results...";
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    setupEditorFeatures();
    loadPyodideAndPackages();
    
    document.getElementById('run-button').addEventListener('click', runPythonCode);
    document.getElementById('clear-btn').addEventListener('click', clearOutput);
});