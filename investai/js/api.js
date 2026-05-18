/**
 * api.js
 * ------
 * All Anthropic API calls go through this module.
 *
 * For production, replace the fetch target with your
 * own backend endpoint that forwards to Anthropic,
 * keeping the API key out of the browser.
 */

const API = {
  async ask(userMessage, systemPrompt = '', maxTokens = CONFIG.MAX_TOKENS) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ⚠️ Move this key to a backend proxy before going to production
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  },
};
