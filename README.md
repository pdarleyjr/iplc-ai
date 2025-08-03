# IPLC AI

IPLC AI Worker for RAG and document processing using Cloudflare Workers, AI, and Vectorize.

## 🚀 Features

- Document processing and embedding generation
- Vector search capabilities
- RAG (Retrieval-Augmented Generation) implementation
- Cloudflare Workers AI integration
- Secure API endpoints

## 📋 Prerequisites

- Node.js 18+ and npm
- Cloudflare account with Workers subscription
- Wrangler CLI installed (`npm install -g wrangler`)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/iplc-ai.git
   cd iplc-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Cloudflare resources**
   Update `wrangler.toml` with your Cloudflare account details and resource IDs.

## 🚀 Development

```bash
npm run dev
```

This will start the development server on port 8788.

## 📦 Deployment

```bash
npm run deploy
```

## 🔒 Security

### Pre-commit Hooks

This project uses pre-commit hooks to prevent accidental exposure of secrets and ensure code quality:

1. **Automatic Installation**
   - Pre-commit hooks are installed automatically when you run `npm install`
   - Husky manages the Git hooks lifecycle

2. **What the hooks check:**
   - **TypeScript compilation**: Ensures all TypeScript code compiles without errors
   - **Secret scanning**: Scans staged files for potential secrets like API keys, tokens, and passwords
   - **Code formatting**: Runs on TypeScript, JavaScript, JSON, and Markdown files (when configured)

3. **Bypassing hooks in emergencies**
   - Use `git commit --no-verify` to bypass pre-commit hooks
   - ⚠️ **WARNING**: Only bypass hooks when absolutely necessary and after manually verifying no secrets are exposed

4. **Secret patterns detected:**
   - GitHub tokens (`ghp_`, `ghs_`, `github_pat_`)
   - API keys and tokens
   - Passwords and private keys
   - AWS credentials
   - Cloudflare tokens
   - And many more common secret patterns

### Manual Secret Scanning

You can run the secret scanner manually:

```bash
# Run secret scanner on staged files
npm run scan-secrets
```

## 📝 Scripts

- `npm run dev` - Start development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run tail` - Tail production logs
- `npm run types` - Generate TypeScript types
- `npm run type-check` - Check TypeScript compilation
- `npm run scan-secrets` - Scan for exposed secrets

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.