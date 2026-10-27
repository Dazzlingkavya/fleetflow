# Publish to a PUBLIC GitHub repository and submit (beginner guide)

You do these steps yourself. Nobody publishes or submits for you.

## A. Before you start
1. Create a free account at https://github.com (if you do not have one).
2. Install **Git**: https://git-scm.com/download/win (accept the default options). Close and reopen VS Code afterwards.
3. Unzip `fleetflow-final.zip`. You will get a folder named `fleetflow`.

## B. Create the empty repository on GitHub
1. On github.com click **+** (top right) > **New repository**.
2. Repository name: `fleetflow`. Choose **Public**.
3. Do **not** tick "Add a README", ".gitignore" or "license" (the project already has files). Click **Create repository**.
4. Copy the repository address shown on the next page, for example `https://github.com/YOUR-NAME/fleetflow.git`.

## C. Upload the project (VS Code terminal, inside the `fleetflow` folder)
```
git init
git add .
git commit -m "FleetFlow: YottaFlex AI challenge"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/fleetflow.git
git push -u origin main
```
GitHub will ask you to sign in in a browser window the first time. The `.gitignore` file already keeps `node_modules` out of the upload.
(Avoid dragging the whole folder into the GitHub website: it only accepts about 100 files per upload, and this project has more.)

## D. Check it is really public
1. Open the repository address in a **private/incognito browser window** (not logged in). You must see the files.
2. Check the README shows on the front page and `output/` and `docs/` folders are there.
3. Optional but recommended: on a different folder run `git clone <your address>`, then `npm run install:all` and `npm test` to be sure it works from GitHub.

## E. Submit on the YottaFlex portal
1. Log in to the YottaFlex portal and open the 72-hour coding challenge submission page.
2. Paste your repository link (`https://github.com/YOUR-NAME/fleetflow`) exactly as it appears in the address bar.
3. Fill in any other fields the portal asks for and press Submit. Keep a screenshot of the confirmation.
4. Do this **before the deadline**, and do not change the repository to Private afterwards.

## F. If something goes wrong
| Problem | Fix |
|---|---|
| `git` is not recognized | Install Git, reopen VS Code |
| `Author identity unknown` | Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then repeat the commit |
| Push rejected | You probably ticked "Add a README". Run `git pull origin main --allow-unrelated-histories`, then `git push` |
| Repository shows as Private | Settings > General > Danger Zone > Change visibility > Public |
