# Custom Find in Page - Chrome Extension

A Chrome extension that replaces the default browser find functionality with a custom UI that includes AI-powered search assistance using DeepSeek API.

## Features

- **Custom Find UI**: Modern, dark-themed find interface that replaces Chrome's default find
- **AI-Powered Search**: When no matches are found, ask AI questions about the page content
- **Chat Mode**: Continue conversations with AI about the current page
- **Smart Text Extraction**: Automatically extracts and summarizes page content for AI context
- **Keyboard Shortcuts**: Use Ctrl+F (Cmd+F on Mac) to open, Esc to close

## Installation

### Developer Mode Installation

1. **Download/Clone** this extension to your computer
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top-right corner
4. **Click "Load unpacked"** and select the folder containing this extension
5. **Configure API Key** (see below)

### API Key Configuration

1. **Get a DeepSeek API Key**:
   - Visit [DeepSeek Platform](https://platform.deepseek.com/)
   - Sign up and obtain an API key

2. **Update the extension**:
   - Open `content_script.js`
   - Find line 3: `const DEEPSEEK_API_KEY = "KEY_HERE";`
   - Replace the placeholder with your actual API key
   - Save the file

3. **Reload the extension**:
   - Go back to `chrome://extensions/`
   - Click the refresh icon on the Custom Find in Page extension

## Usage

### Basic Find Functionality
1. Press **Ctrl+F** (Cmd+F on Mac) on any webpage
2. Type your search term
3. Use the ↑ and ↓ buttons to navigate between matches
4. Press **Esc** to close

### AI-Powered Search
1. When searching for text that doesn't exist on the page, an **"Ask"** button appears
2. Click **"Ask"** or press **Enter** to query the AI about the page content
3. The AI will analyze the page and provide relevant information

### Chat Mode
1. After asking your first question, the interface switches to chat mode
2. Continue the conversation by typing additional questions
3. Use the 🔍 button to return to find mode
4. Use the ✕ button to close the extension

## Privacy & Security

- **Page Content**: Only the first 500 tokens of page text are sent to the AI API
- **API Calls**: Made directly to DeepSeek API from the browser
- **Local Storage**: Conversation history is kept in memory only (not persistent)
- **No Data Collection**: This extension doesn't collect or store user data

## Customization

### AI Behavior
Modify `content_script.js` to adjust:
- Token limits (currently 500 tokens)
- AI model parameters
- System prompts
- Response formatting

## Troubleshooting

### Extension Not Working
1. Check that Developer Mode is enabled in Chrome extensions
2. Verify the extension is loaded and enabled
3. Refresh the page you're testing on

### AI Features Not Working
1. Verify your DeepSeek API key is correctly configured
2. Check browser console for error messages (F12 → Console)
3. Ensure you have internet connectivity
4. Check API key permissions and rate limits

### Find Function Conflicts
- This extension overrides Chrome's default Ctrl+F behavior
- If you need the native find, temporarily disable this extension

## Browser Compatibility

- **Chrome**: Fully supported (Manifest V3)
- **Edge**: Should work (uses Chromium)
- **Firefox**: Not compatible (requires Manifest V2 version)
- **Safari**: Not supported

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify API key configuration
3. Test on different websites
4. Ensure extension permissions are granted

## License

This project is open source. Feel free to modify and distribute according to your needs.
