import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
export default [{ignores:['node_modules/**','react-dist/**']},{
  files:['src/**/*.{js,jsx,mjs}','functions/**/*.mjs','js/firebase-auth.js'],
  languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node},parserOptions:{ecmaFeatures:{jsx:true}}},
  plugins:{react},rules:{...js.configs.recommended.rules,'react/jsx-uses-react':'error','react/jsx-uses-vars':'error','no-unused-vars':['error',{args:'none',caughtErrors:'none'}],'no-empty':['error',{allowEmptyCatch:true}]}
}];
