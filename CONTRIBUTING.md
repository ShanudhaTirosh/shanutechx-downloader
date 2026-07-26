# Contributing to SHANUTECHX Downloader

Thank you for considering contributing to SHANUTECHX Downloader! We welcome contributions from the community.

## 🎯 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue on [GitHub Issues](https://github.com/ShanudhaTirosh/shanutechx-downloader/issues) with:

- A clear, descriptive title
- Steps to reproduce the bug
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Your environment (OS, Node version, etc.)

### Suggesting Features

Feature requests are welcome! Please create an issue with:

- A clear description of the feature
- Why you think it would be useful
- Any implementation ideas you have

### Pull Requests

1. **Fork the Repository**
   ```bash
   git clone https://github.com/ShanudhaTirosh/shanutechx-downloader.git
   cd shanutechx-downloader
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Follow the existing code style
   - Write clear, descriptive commit messages
   - Add tests if applicable
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   pnpm dev      # Test in development
   pnpm build    # Test production build
   pnpm typecheck # Check for type errors
   pnpm lint     # Check code style
   ```

5. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   Use conventional commit messages:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

## 📝 Development Guidelines

### Code Style

- Use TypeScript for all code
- Follow existing patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### TypeScript

- All IPC communication must be typed in `packages/shared-types`
- No `any` types (use `unknown` if necessary)
- Proper return types on all functions
- Use strict mode

### React

- Use functional components with hooks
- Keep components small and reusable
- Use proper prop types
- Follow React best practices

### Electron

- Follow security best practices
- No `nodeIntegration` in renderer
- Use context isolation
- Properly validate IPC messages

### Testing

- Test your changes thoroughly
- Add unit tests for new features
- Ensure existing tests pass
- Test on multiple platforms if possible

## 🏗️ Project Structure

```
shanutechx-downloader/
├── apps/
│   ├── main/               # Electron main process
│   │   ├── src/
│   │   │   ├── db/        # Database layer
│   │   │   ├── engines/   # Download engines
│   │   │   ├── ipc/       # IPC handlers
│   │   │   └── ...
│   └── renderer/           # React frontend
│       └── src/
│           ├── app/       # Page components
│           ├── components/ # Reusable components
│           └── ...
├── packages/
│   └── shared-types/      # Shared TypeScript types
└── docs/                  # Documentation
```

## 🤝 Code of Conduct

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of:

- Age
- Body size
- Disability
- Ethnicity
- Gender identity and expression
- Level of experience
- Nationality
- Personal appearance
- Race
- Religion
- Sexual identity and orientation

### Our Standards

**Positive behavior:**
- Being respectful and inclusive
- Gracefully accepting constructive criticism
- Focusing on what's best for the community
- Showing empathy towards others

**Unacceptable behavior:**
- Harassment or discriminatory language
- Trolling or insulting comments
- Personal or political attacks
- Publishing others' private information
- Other unprofessional conduct

### Enforcement

Instances of abusive or unacceptable behavior may be reported by contacting:
- **Email**: info@shanutechx.com
- **GitHub**: Open an issue

All complaints will be reviewed and investigated promptly and fairly.

## 📞 Getting Help

- **Documentation**: Check the [docs](https://github.com/ShanudhaTirosh/shanutechx-downloader/tree/main/docs) folder
- **Issues**: Search [existing issues](https://github.com/ShanudhaTirosh/shanutechx-downloader/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/ShanudhaTirosh/shanutechx-downloader/discussions)
- **Email**: info@shanutechx.com

## 🎉 Recognition

Contributors will be:
- Listed in the project README
- Credited in release notes
- Given our sincere thanks! 🙏

---

**Thank you for contributing to SHANUTECHX Downloader!**

*Built with ❤️ by [Shanudha Tirosh](https://info.shanutechx.com)*
