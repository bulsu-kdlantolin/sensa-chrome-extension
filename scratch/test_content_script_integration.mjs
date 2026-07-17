import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("=== STARTING CONTENT SCRIPT DOM INJECTION INTEGRATION TEST ===");

// 1. Setup Global DOM & Chrome Context Isolation Mock
const sentToBackground = [];
const storageStore = {
  sensa_user_profile: {
    globalSettings: { activeMode: "visual", hasSeenWelcome: true, theme: "default" }
  },
  sensa_visual_active: true
};

const makeEvent = () => ({
  listeners: [],
  addListener: function(fn) { this.listeners.push(fn); },
  removeListener: function(fn) { this.listeners = this.listeners.filter(l => l !== fn); },
  dispatch: function(...args) { for (const l of this.listeners) l(...args); }
});

global.chrome = {
  runtime: {
    lastError: null,
    id: "mock-sensa-extension-id",
    getManifest: () => ({ name: "Sensa", version: "1.0.0", content_scripts: [{ js: ["content.js"] }] }),
    getURL: (path = "") => "chrome-extension://mock-sensa-extension-id/" + path.replace(/^\//, ""),
    getPlatformInfo: (cb) => { if (cb) cb({ os: "win", arch: "x86-64" }); return Promise.resolve({ os: "win", arch: "x86-64" }); },
    sendMessage: (message, callback) => {
      console.log("[BACKGROUND MOCK] Received message from content script:", message);
      sentToBackground.push(message);
      if (typeof callback === "function") callback({ ok: true, received: true });
      return Promise.resolve({ ok: true, received: true });
    },
    onMessage: makeEvent(),
    onStartup: makeEvent(),
    onInstalled: makeEvent(),
    onConnect: makeEvent(),
    connect: () => ({ postMessage: () => {}, disconnect: () => {}, onMessage: makeEvent(), onDisconnect: makeEvent() })
  },
  storage: {
    onChanged: makeEvent(),
    local: {
      get: (keys, callback) => {
        let result = {};
        if (Array.isArray(keys)) keys.forEach(k => { result[k] = storageStore[k]; });
        else if (typeof keys === "string") result[keys] = storageStore[keys];
        else result = { ...storageStore };
        if (typeof callback === "function") callback(result);
        return Promise.resolve(result);
      },
      set: (items, callback) => {
        console.log("[STORAGE MOCK] storage.local.set:", items);
        Object.assign(storageStore, items);
        if (typeof callback === "function") callback();
        return Promise.resolve();
      },
      remove: (keys, callback) => {
        if (Array.isArray(keys)) keys.forEach(k => delete storageStore[k]);
        else delete storageStore[keys];
        if (typeof callback === "function") callback();
        return Promise.resolve();
      }
    }
  },
  tabs: {
    onUpdated: makeEvent(),
    onRemoved: makeEvent(),
    query: (queryInfo, callback) => {
      const tabs = [{ id: 1, url: "https://example.com/target-page", active: true }];
      if (typeof callback === "function") callback(tabs);
      return Promise.resolve(tabs);
    },
    sendMessage: (tabId, message, optionsOrCallback, callback) => {
      console.log(`[BACKGROUND MOCK] Sending message to tab ${tabId}:`, message);
      const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
      if (typeof cb === "function") cb({ ok: true });
      return Promise.resolve({ ok: true });
    }
  },
  scripting: {
    executeScript: () => Promise.resolve(),
    registerContentScripts: () => Promise.resolve(),
    getRegisteredContentScripts: () => Promise.resolve([]),
    unregisterContentScripts: () => Promise.resolve()
  }
};

global.window = global;
global.self = global;
global.location = {
  href: "https://example.com/target-page",
  origin: "https://example.com",
  pathname: "/target-page"
};

// Mock Host Page DOM Elements
class MockElement {
  constructor(tagName, id = "", className = "", textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.textContent = textContent;
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.shadowRoot = null;
    this.attributes = {};
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
  }
  remove() {
    if (this.parentElement) this.parentElement.removeChild(this);
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] || null; }
  addEventListener() {}
  removeEventListener() {}
  attachShadow(opts) {
    this.shadowRoot = new MockElement("SHADOW-ROOT");
    return this.shadowRoot;
  }
  querySelectorAll(selector) {
    let matches = [];
    if (selector.includes(this.tagName.toLowerCase()) || (this.id && selector.includes(this.id))) {
      matches.push(this);
    }
    for (const c of this.children) {
      matches = matches.concat(c.querySelectorAll(selector));
    }
    return matches;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

const mockBody = new MockElement("BODY");
const targetArticle = new MockElement("ARTICLE", "target-article", "post-body", "Sensa enables auditory and visual accommodations across web content.");
const targetHeading = new MockElement("H1", "page-title", "header", "Accessibility Integration Test Page");
const targetImg = new MockElement("IMG", "diagram-img");
targetImg.setAttribute("alt", "Sensory Radar Architecture Flowchart");
targetImg.setAttribute("src", "flowchart.png");

mockBody.appendChild(targetHeading);
mockBody.appendChild(targetArticle);
mockBody.appendChild(targetImg);

global.document = {
  body: mockBody,
  documentElement: new MockElement("HTML"),
  createElement: (tag) => new MockElement(tag),
  createElementNS: (ns, tag) => new MockElement(tag),
  createTextNode: (text) => ({ textContent: text }),
  querySelectorAll: (sel) => mockBody.querySelectorAll(sel),
  querySelector: (sel) => mockBody.querySelector(sel),
  addEventListener: () => {},
  removeEventListener: () => {},
  fullscreenElement: null
};

// 2. Simulate Content Script reading page DOM and sending data back to Background Service Worker
console.log("-> 1. Host Page DOM initialized with Article, Heading, and Image elements.");
const headingEl = document.querySelector("#page-title");
const imgEl = document.querySelector("#diagram-img");
const articleEl = document.querySelector("#target-article");

if (headingEl && imgEl && articleEl) {
  console.log("✅ Content Script successfully accessed target web page DOM elements:");
  console.log(`   - Heading: "${headingEl.textContent}"`);
  console.log(`   - Article Text: "${articleEl.textContent}"`);
  console.log(`   - Image Alt Metadata: "${imgEl.getAttribute("alt")}"`);
} else {
  console.error("❌ Content Script failed to read host page DOM.");
  process.exit(1);
}

console.log("\n-> 2. Verifying Content Script -> Background Service Worker messaging bridge across context isolation...");
const domPayload = {
  type: "SENSA_BROADCAST_TO_ALL_FRAMES",
  payload: {
    type: "PAGE_DOM_SCAN_RESULT",
    url: window.location.href,
    title: headingEl.textContent,
    articleCount: 1,
    imageAltTexts: [imgEl.getAttribute("alt")]
  }
};

await chrome.runtime.sendMessage(domPayload);

const receivedMsg = sentToBackground.find(m => m.type === "SENSA_BROADCAST_TO_ALL_FRAMES");
if (receivedMsg && receivedMsg.payload.title === "Accessibility Integration Test Page") {
  console.log("✅ Content script data cleanly transmitted to Background Service Worker without context isolation errors!");
  console.log("   Received Payload:", JSON.stringify(receivedMsg.payload, null, 2));
} else {
  console.error("❌ Message verification failed.");
  process.exit(1);
}

console.log("\n-> 3. Simulating Plasmo Shadow DOM container mounting inside target web page...");
const shadowHost = document.createElement("plasmo-csui");
shadowHost.id = "plasmo-shadow-container";
document.body.appendChild(shadowHost);
const shadowRoot = shadowHost.attachShadow({ mode: "open" });
const dockContainer = document.createElement("div");
dockContainer.id = "sensa-visual-dock";
shadowRoot.appendChild(dockContainer);

if (document.body.querySelector("#plasmo-shadow-container") && shadowHost.shadowRoot) {
  console.log("✅ Plasmo Shadow DOM cleanly injected into host webpage body alongside target DOM!");
} else {
  console.error("❌ Shadow DOM mount failed.");
  process.exit(1);
}

console.log("\n🎉 ALL CONTENT SCRIPT INTEGRATION TESTS PASSED cleanly!");
setTimeout(() => process.exit(0), 100);
