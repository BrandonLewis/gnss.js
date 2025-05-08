# Setting up the GitHub Repository

Follow these steps to create and push to a GitHub repository:

1. Go to [GitHub](https://github.com/) and sign in to your account

2. Click the "+" button in the top-right corner and select "New repository"

3. Fill in the repository details:
   - Owner: Your GitHub username or organization
   - Repository name: `gnss.js`
   - Description: "JavaScript module for GNSS device connections, NMEA parsing, and NTRIP client functionality"
   - Set the repository to Public
   - Check "Add a README file" (we already have one locally, but we'll merge it)
   - Choose "MIT License" (we already have one locally, but we'll merge it)
   - Do not add a .gitignore (we already have one)

4. Click "Create repository"

5. After the repository is created, add the remote to your local repository:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/gnss.js.git
   ```

6. Fetch the repository:
   ```bash
   git fetch origin
   ```

7. Merge the remote README and LICENSE (if there are conflicts):
   ```bash
   git merge origin/main --allow-unrelated-histories
   ```

8. Push your local repository to GitHub:
   ```bash
   git push -u origin master
   ```

9. Update the repository URL in package.json to match your actual GitHub username.

Your repository is now set up on GitHub!