import React from 'react';
import ReactDOM from 'react-dom/client';
import EmojiCooccurrence from "./emoji-cooccurrence";

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <EmojiCooccurrence />
  </React.StrictMode>
);