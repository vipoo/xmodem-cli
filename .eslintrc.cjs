module.exports = {
  'env': {
    'browser': false,
    'es2021': true
  },
  'globals': {
    process: false,
    console: false,
    setInterval: false,
    clearInterval: false,
    setTimeout: false,
    require: false,
    module: false,
    Buffer: false
  },
  'extends': 'eslint:recommended',
  'parserOptions': {
    'ecmaVersion': 12,
    'sourceType': 'module'
  },
  'rules': {
    'indent': [
      'error',
      2
    ],
    'linebreak-style': [
      'error',
      'windows'
    ],
    'quotes': [
      'error',
      'single'
    ],
    'semi': [
      'error',
      'never'
    ]
  }
}
