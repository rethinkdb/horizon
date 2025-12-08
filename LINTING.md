# ESLint Setup für Horizon

## ✅ Was wurde eingerichtet

### 1. ESLint 9 Flat Config
- **Datei:** `eslint.config.js` (neue Flat Config Syntax)
- **Alte .eslintrc.js:** Veraltet, wird nicht mehr verwendet
- **Unterstützt:** JavaScript + TypeScript

### 2. Konfiguration

```javascript
// eslint.config.js
import tseslint from "typescript-eslint";

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Deine Custom Rules
    }
  }
];
```

### 3. Dependencies

Alle Module haben jetzt:
- `@eslint/js@^9.0.0`
- `eslint@^9.0.0`
- `globals@^15.0.0`
- `typescript-eslint@^7.0.0`

---

## 🚀 Usage

### Linting ausführen

```bash
# Im Root
npm run lint

# In einem Modul
cd client
npm run lint

# Auto-Fix
npm run lint:fix
```

### Pre-Commit Hook (empfohlen)

```bash
# Installiere husky + lint-staged
npm install --save-dev husky lint-staged

# Setup
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

`.lintstagedrc.json`:
```json
{
  "*.{js,ts}": ["eslint --fix", "git add"],
  "*.{json,md}": ["prettier --write", "git add"]
}
```

---

## 📋 Regeln

### Aktivierte Regeln

#### Code Style
- `arrow-body-style`: Arrow functions ohne unnötige Klammern
- `comma-dangle`: Trailing commas in Multiline
- `indent`: 2 Spaces
- `max-len`: 100 Zeichen (URLs ignoriert)
- `quotes`: Single quotes
- `semi`: Semicolons erforderlich

#### Best Practices
- `no-var`: Verwende let/const statt var
- `prefer-const`: const für nicht-reassignierte Variablen
- `prefer-arrow-callback`: Arrow functions bevorzugt
- `eqeqeq`: === statt ==
- `no-eval`: eval() verboten

#### TypeScript
- `@typescript-eslint/no-explicit-any`: Warnung bei `any`
- `@typescript-eslint/no-unused-vars`: Fehler bei unbenutzten Variablen
- Ignoriere Variablen mit `_` Prefix (z.B. `_unused`)

### Disabled Rules
- `no-console`: Erlaubt (für Server-Side Code)
- `@typescript-eslint/explicit-function-return-type`: Optional

---

## 🔧 Customization

### Projekt-spezifische Regeln

```javascript
// In einem Modul: eslint.config.js
export default [
  ...tseslint.configs.recommended,
  {
    rules: {
      // Überschreibe globale Regeln
      "max-len": ["error", { code: 120 }],
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
```

### Ignore Files

```javascript
// eslint.config.js
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/*.min.js"
    ]
  }
];
```

---

## 🐛 Troubleshooting

### Problem: "Parsing error"

```bash
# Lösung: Dependencies installieren
npm install
```

### Problem: "Unable to resolve path to module"

```javascript
// tsconfig.json: paths konfigurieren
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Problem: "Rule not found"

```bash
# Lösung: Plugin installieren
npm install --save-dev eslint-plugin-NAME
```

### Problem: ".eslintrc.js" wird ignoriert

ESLint 9 verwendet Flat Config (`eslint.config.js`).

**Migration:**
```bash
# Alte Config löschen
rm .eslintrc.js

# Neue Config verwenden
mv eslint.config.js.example eslint.config.js
```

---

## 📊 Lint-Statistiken

### Check alle Files

```bash
# Anzahl Fehler/Warnungen
npm run lint 2>&1 | grep -E "error|warning"

# Probleme nach Datei
npm run lint -- --format json > lint-report.json
```

### CI/CD Integration

```yaml
# .github/workflows/lint.yml
name: Lint
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run lint
```

---

## 🎯 Best Practices

### 1. Lint oft
```bash
# Watch-Mode (mit nodemon)
nodemon --watch src --exec "npm run lint"
```

### 2. Editor Integration

#### VS Code
```json
// .vscode/settings.json
{
  "eslint.enable": true,
  "eslint.format.enable": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### WebStorm
Settings → Languages → JavaScript → Code Quality Tools → ESLint
- ✅ Automatic ESLint configuration
- ✅ Run eslint --fix on save

### 3. Team Standards

```javascript
// Strikte Regeln für Production Code
export default [
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error", // Kein any!
      "@typescript-eslint/explicit-function-return-type": "warn"
    }
  },
  {
    // Relaxed für Tests
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
```

---

## 📚 Ressourcen

- [ESLint 9 Docs](https://eslint.org/docs/latest/)
- [Flat Config Migration](https://eslint.org/docs/latest/use/configure/migration-guide)
- [TypeScript ESLint](https://typescript-eslint.io/)
- [ESLint Rules](https://eslint.org/docs/rules/)

---

## 🎓 Common Fixes

### Fix: `any` Type
```typescript
// ❌ Bad
function process(data: any) { ... }

// ✅ Good
function process<T>(data: T) { ... }
// oder
function process(data: unknown) { ... }
```

### Fix: Unused Variables
```typescript
// ❌ Bad
const result = api.call();

// ✅ Good
const _result = api.call(); // _ prefix = ignoriert
// oder
void api.call(); // Explizit ignorieren
```

### Fix: No Trailing Spaces
```bash
# Auto-fix im ganzen Projekt
npm run lint:fix
```

---

**Status:** ✅ ESLint 9 mit TypeScript eingerichtet  
**Config:** `eslint.config.js` (Flat Config)  
**Regeln:** Strict aber fair 😊
