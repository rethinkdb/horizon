# TypeScript Migration für Horizon

## ✅ Was wurde eingerichtet

### 1. TypeScript Dependencies
Alle 3 Module haben jetzt:
- `typescript@5.3.3`
- `ts-node@10.9.2`
- `@types/node@20.11.0`
- Weitere @types Packages

### 2. tsconfig.json
Erstellt für:
- `/client/tsconfig.json` - Browser/UMD Build
- `/server/tsconfig.json` - Node.js/CommonJS
- `/cli/tsconfig.json` - Node.js/CommonJS

Alle mit:
- `strict: true` (Type Safety!)
- `allowJs: true` (JS/TS gemischt möglich)
- `sourceMap: true` (Debugging)

### 3. Build Scripts
Aktualisiert in allen package.json:
- `npm run build` - Kompiliert TypeScript
- `npm run dev` - Watch-Mode mit ts-node
- `npm start` - Startet kompilierten Code

### 4. Webpack für TypeScript
Client webpack.config.js:
- Entry: `.ts` Dateien
- Babel mit `@babel/preset-typescript`
- ts-loader für .ts files
- Beide .js und .ts werden unterstützt

---

## 🚀 Migration Strategie

### Schrittweise Migration (Empfohlen!)

**Du kannst JS und TS mischen!** `allowJs: true` bedeutet:
- Bestehende `.js` Files funktionieren weiter
- Neue Files als `.ts` schreiben
- Nach und nach `.js` → `.ts` umbenennen

### Beispiel Migration

#### Vorher (auth.js)
```javascript
// src/auth.js
export function authenticate(token) {
  return validateToken(token);
}
```

#### Nachher (auth.ts)
```typescript
// src/auth.ts
export function authenticate(token: string): boolean {
  return validateToken(token);
}
```

### Quick Start

```bash
cd /Users/anton.feldmann/Projects/priv/horizon

# 1. Dependencies installieren
cd client && npm install
cd ../server && npm install
cd ../cli && npm install

# 2. Ersten .ts File erstellen (Test)
cd client
echo "export const version: string = '2.0.0';" > src/version.ts

# 3. TypeScript kompilieren
npm run build:ts

# 4. Development mit Watch-Mode
npm run dev
```

---

## 📝 Migration Reihenfolge

### Phase 1: Types hinzufügen (ohne Umbenennen)
```typescript
// In bestehenden .js Files (werden von tsc geprüft wenn checkJs: true)
/**
 * @param {string} token
 * @returns {boolean}
 */
export function authenticate(token) {
  return validateToken(token);
}
```

### Phase 2: Kritische Files → .ts
Priority Files für Migration:
1. `client/src/index.js` → `index.ts`
2. `client/src/model.js` → `model.ts`
3. `server/src/horizon.js` → `horizon.ts`
4. `cli/src/main.js` → `main.ts`

### Phase 3: Interfaces definieren
```typescript
// types.ts
export interface HorizonConfig {
  host: string;
  port: number;
  secure: boolean;
}

export interface Collection<T> {
  fetch(): Promise<T[]>;
  store(item: T): Promise<T>;
}
```

### Phase 4: Generics verwenden
```typescript
class Collection<T> {
  constructor(private name: string) {}
  
  fetch(): Promise<T[]> {
    return this.request('fetch');
  }
  
  store(item: T): Promise<T> {
    return this.request('store', item);
  }
}
```

---

## 🎯 Vorteile von TypeScript

### 1. Type Safety
```typescript
// Fehler wird bei Compile-Zeit gefangen!
const col: Collection<User> = horizon('users');
col.store({ name: 123 }); // ❌ Error: number is not assignable to string
```

### 2. IntelliSense / Autocomplete
```typescript
const user = await horizon('users').fetch();
user. // IDE zeigt alle Properties von User!
```

### 3. Refactoring
```typescript
// Umbenennen einer Property in Interface
// → Alle Nutzungen werden automatisch gefunden!
interface User {
  firstName: string; // war vorher: name
}
```

### 4. Documentation
```typescript
/**
 * Authenticates a user with a JWT token
 * @param token - JWT token string
 * @returns True if valid, false otherwise
 */
export function authenticate(token: string): boolean {
  return validateToken(token);
}
```

---

## 🔧 TypeScript Konfiguration Details

### Client (Browser Build)
```json
{
  "target": "ES2020",
  "module": "ES2020",        // ESM für Tree-Shaking
  "lib": ["ES2020", "DOM"],  // Browser APIs
  "moduleResolution": "bundler"
}
```

### Server & CLI (Node.js)
```json
{
  "target": "ES2020",
  "module": "commonjs",      // Node.js require()
  "lib": ["ES2020"],
  "moduleResolution": "node"
}
```

---

## 🚨 Troubleshooting

### Problem: `Cannot find module`
```bash
# Lösung: Types installieren
npm install --save-dev @types/MODULE_NAME
```

### Problem: `Property does not exist`
```typescript
// Lösung: Interface erweitern
declare module 'rxjs' {
  interface Observable<T> {
    myCustomMethod(): Observable<T>;
  }
}
```

### Problem: `'this' implicitly has type 'any'`
```typescript
// Lösung: this explizit typen
class MyClass {
  method(this: MyClass) {
    // ...
  }
}
```

---

## 📦 Nächste Schritte

1. **Installieren**
   ```bash
   npm install  # in client, server, cli
   ```

2. **Ersten .ts File erstellen**
   ```bash
   cd client/src
   mv index.js index.ts
   # Fehler beheben (Types hinzufügen)
   ```

3. **Kompilieren & Testen**
   ```bash
   npm run build:ts
   npm test
   ```

4. **Schrittweise weitermachen**
   - Ein File nach dem anderen
   - Tests grün halten
   - Types nach und nach verfeinern

---

## 📚 Ressourcen

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript for JS Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [DefinitelyTyped (@types)](https://github.com/DefinitelyTyped/DefinitelyTyped)
- [TSConfig Reference](https://www.typescriptlang.org/tsconfig)

---

**Status:** ✅ TypeScript Setup komplett  
**JS kompatibel:** ✅ Ja, beide funktionieren parallel  
**Breaking Changes:** ❌ Keine - vollständig rückwärtskompatibel
