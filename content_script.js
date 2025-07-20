(() => {
    let ui = null;
    let conversationHistory = [];
    let isRequestInProgress = false;
    let abortController = null;
    let isChatMode = false;
    let pageContext = null; // Store page context once
    // Toggle functions will be defined when UI is created
    let switchToFindMode;
    let switchToChatMode;
    // Get DeepSeek API key from global config loaded in config.js
    const DEEPSEEK_API_KEY = window.DEEPSEEK_API_KEY;

    // Enhanced Markdown parser
    const parseMarkdown = (text) => {
        let formattedText = text;

        const escapeHtml = (unsafe, allowHtml = false) => {
            if (allowHtml) return unsafe;
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // Handle metadata block first
        const metadataRegex = /^Page Title:.*?\nURL:.*?\nPercentage of content sent:.*?\n\n/s;
        const metadataMatch = formattedText.match(metadataRegex);
        if (metadataMatch) {
            const metadata = metadataMatch[0];
            formattedText = formattedText.replace(metadataRegex, '');
            formattedText = `<pre>${escapeHtml(metadata.trim())}</pre>\n\n` + formattedText;
        }

        // Handle horizontal rules
        formattedText = formattedText.replace(/^---+$/gm, "<hr>");

        // Handle code blocks before other processing
        formattedText = formattedText.replace(
            /^```(\w*)\n([\s\S]*?)\n```$/gm,
            (match, lang, code) => `<pre><code class="language-${lang}">${escapeHtml(code)}</code></pre>`
        );

        // Handle inline code before other text formatting
        formattedText = formattedText.replace(/`([^`\n]+)`/g, (match, code) => `<code>${escapeHtml(code)}</code>`);

        // Handle URLs
        const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]\}])/g;
        formattedText = formattedText.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        });

        // Handle headings
        formattedText = formattedText.replace(
            /^(#{1,6})\s*(.+)$/gm,
            (match, hashes, content) => `<h${hashes.length}>${content.trim()}</h${hashes.length}>`
        );

        // Handle blockquotes (multi-line support)
        formattedText = formattedText.replace(/^>\s*(.+)$/gm, (match, content) => `<blockquote>${content}</blockquote>`);

        // Handle unordered lists (better multi-line support)
        formattedText = formattedText.replace(
            /^((?:[-*+]\s+.+(?:\n|$))+)/gm,
            (match) => {
                const items = match.trim().split("\n").map(item => {
                    const content = item.replace(/^[-*+]\s+(.+)$/, "$1");
                    return `<li>${content}</li>`;
                }).join("");
                return `<ul>${items}</ul>`;
            }
        );

        // Handle ordered lists (better multi-line support)
        formattedText = formattedText.replace(
            /^((?:\d+\.\s+.+(?:\n|$))+)/gm,
            (match) => {
                const items = match.trim().split("\n").map(item => {
                    const content = item.replace(/^\d+\.\s+(.+)$/, "$1");
                    return `<li>${content}</li>`;
                }).join("");
                return `<ol>${items}</ol>`;
            }
        );

        // Handle text formatting (order matters)
        // Bold text
        formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        formattedText = formattedText.replace(/__(.*?)__/g, "<strong>$1</strong>");

        // Italic text (avoid conflict with bold)
        formattedText = formattedText.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
        formattedText = formattedText.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");

        // Strikethrough
        formattedText = formattedText.replace(/~~(.*?)~~/g, "<del>$1</del>");

        // Handle paragraphs and line breaks
        const lines = formattedText.split("\n");
        const processedLines = [];
        let inBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if we're in a block element
            const isBlockElement = line.startsWith("<h") || line.startsWith("<ul") ||
                line.startsWith("<ol") || line.startsWith("<blockquote") ||
                line.startsWith("<pre") || line.startsWith("<hr") ||
                line.includes("</ul>") || line.includes("</ol>") ||
                line.includes("</blockquote>") || line.includes("</pre>");

            if (isBlockElement) {
                inBlock = true;
                processedLines.push(line);
            } else if (line === "") {
                if (inBlock) {
                    inBlock = false;
                }
                processedLines.push("");
            } else if (!inBlock && line.length > 0) {
                // Regular paragraph text
                processedLines.push(`<p>${line}</p>`);
            } else {
                processedLines.push(line);
            }
        }

        formattedText = processedLines.join("\n");

        // Clean up extra newlines and normalize spacing
        formattedText = formattedText.replace(/\n{3,}/g, "\n\n");
        formattedText = formattedText.replace(/^\n+|\n+$/g, "");

        return escapeHtml(formattedText, true);
    };

    // Ctrl+F to open the finder
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
            e.preventDefault();
            ui = document.getElementById("myFindBar");
            if (!ui) {
                const container = document.createElement("div");
                container.id = "myFindBar";
                container.style.display = "none";
                container.innerHTML = `
                    <div id="findBarContent">
                        <div id="findInputWrapper">
                            <input id="findInput" type="text" placeholder="Find...">
                        </div>
                        <span id="findStatus"></span>
                        <button id="askButton" style="display: none;">Ask</button>
                        <div id="buttonGroup">
                            <button id="findPrev">↑</button>
                            <button id="findNext">↓</button>
                            <button id="findClose">✕</button>
                        </div>
                    </div>
                    <div id="chatContainer" style="display: none;">
                        <div id="chatHeader">
                            <button id="backToFindButton">🔍</button>
                            <button id="chatCloseButton">✕</button>
                        </div>
                        <div id="chatMessages"></div>
                        <div id="pageReadMessage" style="display: none;"></div>
                        <div id="chatInputArea">
                            <div id="chatInputWrapper">
                                <input id="chatInput" type="text" placeholder="Type your message...">
                                <button id="chatSendButton">Ask</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(container);
                ui = container;

                const findBarContent = container.querySelector("#findBarContent");
                const findInput = container.querySelector("#findInput");
                const findStatus = container.querySelector("#findStatus");
                const askButton = container.querySelector("#askButton");
                const findPrev = container.querySelector("#findPrev");
                const findNext = container.querySelector("#findNext");
                const chatContainer = container.querySelector("#chatContainer");
                const chatMessages = container.querySelector("#chatMessages");
                const pageReadMessage = container.querySelector("#pageReadMessage");
                const chatInput = container.querySelector("#chatInput");
                const chatSendButton = container.querySelector("#chatSendButton");
                const backToFindButton = container.querySelector("#backToFindButton");
                const chatCloseButton = container.querySelector("#chatCloseButton");

                let matches = [];
                let currentIndex = 0;
                let inputTimeout;
                let originalContent = null;

                const storeOriginalContent = () => {
                    if (!originalContent) {
                        originalContent = document.body.cloneNode(true);
                    }
                };

                const restoreOriginalContent = () => {
                    if (originalContent) {
                        const allHighlights = document.querySelectorAll(".highlight, .current");
                        allHighlights.forEach(span => {
                            const parent = span.parentNode;
                            if (parent) {
                                parent.replaceChild(document.createTextNode(span.textContent), span);
                            }
                        });
                        document.body.normalize();
                    }
                };

                const highlightMatches = () => {
                    restoreOriginalContent();
                    matches.forEach((match, i) => {
                        const range = document.createRange();
                        try {
                            range.setStart(match.node, match.start);
                            range.setEnd(match.node, match.end);
                            const span = document.createElement("span");
                            span.className = "highlight";
                            range.surroundContents(span);
                            matches[i].element = span;
                        } catch (e) {
                            console.log("Error highlighting match:", e);
                        }
                    });
                    updateFindStatus();
                };

                const updateFindStatus = () => {
                    const hasText = findInput.value.trim().length > 0;
                    const hasMatches = matches.length > 0;

                    if (!hasText) {
                        findStatus.textContent = "";
                        findStatus.classList.remove("visible");
                        askButton.style.display = "none";
                        findPrev.classList.remove("visible");
                        findNext.classList.remove("visible");
                        findStatus.style.display = "none";
                        findPrev.style.display = "none";
                        findNext.style.display = "none";
                    } else if (hasMatches) {
                        findStatus.textContent = `${currentIndex + 1}/${matches.length}`;
                        findStatus.style.display = "inline-block";
                        askButton.style.display = "none";
                        findPrev.style.display = "inline-block";
                        findNext.style.display = "inline-block";
                        findStatus.classList.add("visible");
                        findPrev.classList.add("visible");
                        findNext.classList.add("visible");
                    } else {
                        findStatus.textContent = "No matches";
                        findStatus.style.display = "inline-block";
                        askButton.style.display = "block";
                        findPrev.style.display = "none";
                        findNext.style.display = "none";
                        findStatus.classList.add("visible");
                        findPrev.classList.remove("visible");
                        findNext.classList.remove("visible");
                    }
                };

                const isElementVisible = (element) => {
                    const style = window.getComputedStyle(element);
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        !(style.height === "0px" && style.overflow === "hidden") &&
                        element.getClientRects().length > 0
                    );
                };

                const getAllPageText = () => {
                    let pageText = "";
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: (node) => {
                                const parent = node.parentNode;
                                if (!parent || parent.closest("#myFindBar") ||
                                    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.nodeName)) {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                let currentElement = parent;
                                while (currentElement && currentElement !== document.body) {
                                    if (!isElementVisible(currentElement)) {
                                        return NodeFilter.FILTER_REJECT;
                                    }
                                    currentElement = currentElement.parentNode;
                                }
                                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                            }
                        }
                    );

                    let totalTokens = 0;
                    let tokens = [];
                    let node;
                    while ((node = walker.nextNode())) {
                        const text = node.nodeValue.trim();
                        if (text) {
                            const nodeTokens = text.replace(/[^\w\s]|_/g, " ").split(/\s+/).filter(token => token.length > 0);
                            totalTokens += nodeTokens.length;
                            tokens.push(...nodeTokens);
                        }
                    }

                    const cappedTokens = tokens.slice(0, 500);
                    pageText = cappedTokens.join(" ");
                    const percentageSent = totalTokens > 0 ? Math.min((cappedTokens.length / totalTokens) * 100, 100).toFixed(2) : "0.00";
                    const pageTitle = document.title || "Untitled Page";
                    const pageUrl = window.location.href;
                    const metadata = `Page Title: ${pageTitle}\nURL: ${pageUrl}\nPercentage of content sent: ${percentageSent}%\n\n`;
                    return { pageText: metadata + pageText, percentageSent, totalTokens };
                };

                switchToChatMode = (initialQuery) => {
                    isChatMode = true;
                    if (!pageContext) {
                        pageContext = getAllPageText(); // Capture page context only once
                    }
                    findBarContent.style.display = "none";
                    chatContainer.style.display = "block";

                    const userMessage = document.createElement("div");
                    userMessage.className = "chat-message user-message";
                    userMessage.textContent = initialQuery;
                    chatMessages.appendChild(userMessage);

                    const skeletonContainer = document.createElement("div");
                    skeletonContainer.className = "chat-message assistant-message skeleton-container";
                    skeletonContainer.innerHTML = `
                        <div class="skeleton-line"></div>
                        <div class="skeleton-line medium"></div>
                        <div class="skeleton-line short"></div>
                    `;
                    chatMessages.appendChild(skeletonContainer);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                };

                switchToFindMode = () => {
                    isChatMode = false;
                    pageContext = null; // Reset page context
                    findBarContent.style.display = "flex";
                    chatContainer.style.display = "none";
                    chatMessages.innerHTML = "";
                    pageReadMessage.style.display = "none";
                    conversationHistory = [];
                    restoreOriginalContent();

                    // Reset button loading states
                    askButton.classList.remove("loading");
                    askButton.textContent = "Ask";
                    chatSendButton.classList.remove("loading");
                    chatSendButton.textContent = "Ask";
                };

                const closeUI = () => {
                    container.classList.remove("slide-down");
                    container.classList.add("slide-up");
                    setTimeout(() => {
                        container.remove();
                        restoreOriginalContent();
                        ui = null;
                        conversationHistory = [];
                        isChatMode = false;
                        chatMessages.innerHTML = "";
                        pageReadMessage.style.display = "none";
                        pageContext = null;
                    }, 300);
                };

                const askDeepSeek = async (query) => {
                    if (isRequestInProgress) return;

                    isRequestInProgress = true;
                    abortController = new AbortController();
                    container.querySelector("#chatInputArea").style.display = "none";

                    if (!isChatMode) {
                        switchToChatMode(query);
                    } else {
                        const userMessage = document.createElement("div");
                        userMessage.className = "chat-message user-message";
                        userMessage.textContent = query;
                        chatMessages.appendChild(userMessage);

                        const skeletonContainer = document.createElement("div");
                        skeletonContainer.className = "chat-message assistant-message skeleton-container";
                        skeletonContainer.innerHTML = `
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line medium"></div>
                            <div class="skeleton-line short"></div>
                        `;
                        chatMessages.appendChild(skeletonContainer);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }

                    const percentage = parseFloat(pageContext.percentageSent);
                    if (pageContext.totalTokens > 500) {
                        pageReadMessage.classList.add("skeleton");
                        pageReadMessage.textContent = "Analyzing page length...";
                        pageReadMessage.style.display = "block";
                    } else {
                        pageReadMessage.style.display = "none";
                    }

                    try {
                        if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === "your_actual_api_key_here") {
                            throw new Error("Invalid DeepSeek API key. Please update the DEEPSEEK_API_KEY in content_script.js.");
                        }

                        if (conversationHistory.length > 10) {
                            conversationHistory = conversationHistory.slice(-10);
                        }

                        conversationHistory.push({ role: "user", content: query });

                        let messages;
                        if (conversationHistory.length === 1) {
                            const systemPrompt = `You are a helpful assistant that MUST follow strict formatting rules.

CRITICAL FORMATTING REQUIREMENTS:
- ALWAYS use proper Markdown formatting for ALL responses
- Use headings (# ## ###) for section organization
- Use **bold** for key terms and important information
- Use *italic* for emphasis and clarification
- Use \`inline code\` for technical terms, commands, and specific values
- Use code blocks (\`\`\`language\ncode\n\`\`\`) for multi-line code or structured data
- Use bullet points (- item) for lists and enumeration
- Use numbered lists (1. item) for sequential steps or rankings
- Use > blockquotes for quotes, definitions, or highlighting important notes
- Always separate paragraphs with blank lines
- Use --- for section dividers when appropriate
- Format URLs as proper links when mentioned

CONTENT STRUCTURE REQUIREMENTS:
- Start with a clear, concise summary or direct answer
- Organize information hierarchically with appropriate headings
- Use consistent formatting patterns throughout the response
- End with actionable next steps or conclusions when relevant

FORBIDDEN:
- Plain text responses without any formatting
- Inconsistent formatting patterns
- Missing structure or organization
- Unformatted code, commands, or technical terms

Here is the context of the webpage:

${pageContext.pageText}`;
                            messages = [
                                { role: "system", content: systemPrompt },
                                ...conversationHistory
                            ];
                        } else {
                            // Add formatting reminder for follow-up messages
                            const formatReminder = {
                                role: "system",
                                content: "Continue using strict Markdown formatting in your response. Use headings, bold text, lists, code blocks, and proper structure as required."
                            };
                            messages = [formatReminder, ...conversationHistory];
                        }

                        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
                            },
                            body: JSON.stringify({
                                model: "deepseek-chat",
                                messages: messages,
                                max_tokens: 800,
                                stream: true
                            }),
                            signal: abortController.signal
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            if (response.status === 429) {
                                throw new Error("Rate limit exceeded. Please try again later.");
                            }
                            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
                        }

                        if (pageContext.totalTokens > 500) {
                            pageReadMessage.classList.remove("skeleton");
                            pageReadMessage.textContent = `📄 Page too long: Only ${pageContext.percentageSent}% analyzed (${Math.min(500, pageContext.totalTokens)} of ${pageContext.totalTokens} tokens)`;
                            pageReadMessage.style.display = "block";
                        } else {
                            pageReadMessage.style.display = "none";
                        }

                        const responseMessage = document.createElement("div");
                        responseMessage.className = "chat-message assistant-message fade-in";
                        chatMessages.appendChild(responseMessage);

                        let fullResponse = "";
                        let hasReceivedContent = false;
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const chunk = decoder.decode(value);
                            const lines = chunk.split("\n");

                            for (const line of lines) {
                                if (line.startsWith("data: ")) {
                                    const data = line.slice(6);
                                    if (data === "[DONE]") break;

                                    try {
                                        const parsed = JSON.parse(data);
                                        const content = parsed.choices[0]?.delta?.content || "";
                                        if (content) {
                                            // Remove skeleton only when we receive the first content
                                            if (!hasReceivedContent) {
                                                const skeletonContainer = chatMessages.querySelector(".skeleton-container");
                                                if (skeletonContainer) {
                                                    skeletonContainer.remove();
                                                }
                                                hasReceivedContent = true;
                                            }
                                            fullResponse += content;
                                            responseMessage.innerHTML = parseMarkdown(fullResponse);
                                            chatMessages.scrollTop = chatMessages.scrollHeight;
                                        }
                                    } catch (e) {
                                        console.error("Error parsing stream chunk:", e, "Chunk:", data);
                                    }
                                }
                            }
                        }

                        conversationHistory.push({ role: "assistant", content: fullResponse });
                        responseMessage.scrollIntoView({ behavior: "smooth", block: "start" });
                    } catch (error) {
                        // Remove skeleton on error
                        const skeletonContainer = chatMessages.querySelector(".skeleton-container");
                        if (skeletonContainer) {
                            skeletonContainer.remove();
                        }

                        if (error.name === "AbortError") {
                            console.log("Request canceled by user");
                        } else {
                            console.error("Error with DeepSeek API:", error);
                            const errorMessage = document.createElement("div");
                            errorMessage.className = "chat-message assistant-message fade-in";
                            errorMessage.innerHTML = parseMarkdown(`Error: ${error.message}`);
                            chatMessages.appendChild(errorMessage);
                            errorMessage.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                        pageReadMessage.style.display = "none";
                    } finally {
                        isRequestInProgress = false;
                        abortController = null;
                        const chatInputArea = container.querySelector("#chatInputArea");
                        chatInputArea.style.display = "flex";
                        chatInputArea.style.animation = "slideInUp 0.4s ease-out";

                        // Remove animation after it completes to allow re-triggering
                        setTimeout(() => {
                            chatInputArea.style.animation = "";
                        }, 400);

                        // Remove loading states from buttons
                        askButton.classList.remove("loading");
                        askButton.textContent = "Ask";
                        chatSendButton.classList.remove("loading");
                        chatSendButton.textContent = "Ask";
                    }
                };

                askButton.addEventListener("click", () => {
                    if (findInput.value.trim().length > 0 && !isRequestInProgress) {
                        askButton.classList.add("loading");
                        askButton.textContent = "...";
                        askDeepSeek(findInput.value);
                    }
                });

                findInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && matches.length === 0 && findInput.value.trim().length > 0 && !isRequestInProgress) {
                        e.preventDefault();
                        askButton.classList.add("loading");
                        askButton.textContent = "...";
                        askDeepSeek(findInput.value);
                    }
                });

                chatSendButton.addEventListener("click", () => {
                    if (chatInput.value.trim().length > 0 && !isRequestInProgress) {
                        chatSendButton.classList.add("loading");
                        chatSendButton.textContent = "...";
                        askDeepSeek(chatInput.value);
                        chatInput.value = "";
                    }
                });

                chatInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && chatInput.value.trim().length > 0 && !isRequestInProgress) {
                        e.preventDefault();
                        chatSendButton.classList.add("loading");
                        chatSendButton.textContent = "...";
                        askDeepSeek(chatInput.value);
                        chatInput.value = "";
                    }
                });

                backToFindButton.addEventListener("click", () => {
                    switchToFindMode();
                });

                chatCloseButton.addEventListener("click", () => {
                    closeUI();
                });

                const doFind = () => {
                    storeOriginalContent();
                    restoreOriginalContent();

                    const val = findInput.value.toLowerCase().trim();
                    if (!val) {
                        matches = [];
                        updateFindStatus();
                        return;
                    }

                    matches = [];
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        {
                            acceptNode: (node) => {
                                const parent = node.parentNode;
                                if (!parent || parent.closest("#myFindBar") ||
                                    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.nodeName)) {
                                    return NodeFilter.FILTER_REJECT;
                                }
                                let currentElement = parent;
                                while (currentElement && currentElement !== document.body) {
                                    if (!isElementVisible(currentElement)) {
                                        return NodeFilter.FILTER_REJECT;
                                    }
                                    currentElement = currentElement.parentNode;
                                }
                                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                            }
                        }
                    );

                    let node;
                    while ((node = walker.nextNode())) {
                        const text = node.nodeValue.toLowerCase();
                        let idx = text.indexOf(val);
                        while (idx !== -1) {
                            matches.push({
                                node,
                                start: idx,
                                end: idx + val.length,
                                text: node.nodeValue.substring(idx, idx + val.length)
                            });
                            idx = text.indexOf(val, idx + 1);
                        }
                    }

                    if (matches.length > 0) {
                        requestAnimationFrame(() => {
                            highlightMatches();
                            navigate(0);
                        });
                    } else {
                        updateFindStatus();
                    }
                };

                findInput.addEventListener("input", () => {
                    clearTimeout(inputTimeout);
                    restoreOriginalContent();

                    inputTimeout = setTimeout(() => {
                        if (findInput.value.trim().length > 0) {
                            doFind();
                        } else {
                            restoreOriginalContent();
                            updateFindStatus();
                        }
                    }, 150);
                });

                const navigate = (dir) => {
                    if (!matches.length) {
                        currentIndex = 0;
                        updateFindStatus();
                        return;
                    }

                    document.querySelectorAll(".current").forEach(el => {
                        el.classList.remove("current");
                        el.style.backgroundColor = "#ffeb3b";
                        el.style.color = "#000";
                    });

                    if (dir !== 0) {
                        currentIndex = (currentIndex + dir + matches.length) % matches.length;
                    } else {
                        currentIndex = 0;
                    }

                    const currentMatch = matches[currentIndex];
                    if (currentMatch && currentMatch.element) {
                        currentMatch.element.classList.add("current");
                        currentMatch.element.style.backgroundColor = "#ff9800";
                        currentMatch.element.style.color = "#333";
                        currentMatch.element.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                    updateFindStatus();
                };

                findPrev.addEventListener("click", () => navigate(-1));
                findNext.addEventListener("click", () => navigate(1));
                container.querySelector("#findClose").addEventListener("click", () => {
                    closeUI();
                });

                findInput.focus();
            } else if (isChatMode) {
                // Only switch to find mode if function is defined
                if (typeof switchToFindMode === 'function') {
                    switchToFindMode();
                }
            }

            if (ui.style.display === "none" || !ui.style.display) {
                ui.style.display = "flex";
                ui.classList.remove("slide-up", "slide-down");
                // Force a reflow to ensure the element is in its initial state
                void ui.offsetHeight;
                // Then immediately add the slide-down class to trigger animation
                requestAnimationFrame(() => {
                    ui.classList.add("slide-down");
                });

                ui.querySelector("#findInput").focus();
            } else {
                ui.classList.remove("slide-down");
                ui.classList.add("slide-up");
                setTimeout(() => {
                    ui.style.display = "none";
                }, 300);
            }
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || e.key === "Esc") {
            if (ui && ui.style.display !== "none") {
                ui.classList.remove("slide-down");
                ui.classList.add("slide-up");
                setTimeout(() => {
                    ui.style.display = "none";
                }, 300);
            }
        }
    });
})();