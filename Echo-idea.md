# ECHO
This document will showcase what Echo is about and how it works

First of all Echo is a documentation-focused website
that allows users to write different types of documentation
for the same code base from user manuals to copyrights

The most important factor in this code base is it is
completly non reliant on AI LLMS such as grock or Claude
and is completly done in code base in backend

## Structure
.
├── Echo-idea.md
├── README.md
├── be
│   ├── Dockerfile
│   ├── package.json
│   ├── src
│   │   ├── common
│   │   │   ├── db.ts
│   │   │   ├── env.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── logger.ts
│   │   │   └── openai.ts
│   │   ├── modules
│   │   │   ├── auth
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── auth.router.ts
│   │   │   │   ├── auth.schema.ts
│   │   │   │   └── auth.service.ts
│   │   │   ├── docs
│   │   │   │   ├── docs.controller.ts
│   │   │   │   ├── docs.router.ts
│   │   │   │   ├── docs.schema.ts
│   │   │   │   └── docs.service.ts
│   │   │   ├── github
│   │   │   │   ├── github.controller.ts
│   │   │   │   ├── github.router.ts
│   │   │   │   └── github.service.ts
│   │   │   └── settings
│   │   │       ├── settings.controller.ts
│   │   │       ├── settings.router.ts
│   │   │       └── settings.service.ts
│   │   ├── routes.ts
│   │   ├── schema.ts
│   │   └── server.ts
│   └── tsconfig.json
├── db
│   └── init.sql
├── docker-compose.yml
├── fe
│   ├── Dockerfile
│   ├── README.md
│   ├── __tests__
│   │   └── App.test.tsx
│   ├── dist
│   │   ├── assets
│   │   │   ├── index-9EwFzFKu.js
│   │   │   └── index-B9hnkX2q.css
│   │   ├── icon.png
│   │   └── index.html
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── public
│   │   └── icon.png
│   ├── src
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── MyErrorBoundary.tsx
│   │   ├── SignedUp
│   │   │   ├── CSS
│   │   │   │   ├── Documents.css
│   │   │   │   ├── EditDoc.css
│   │   │   │   ├── MyDocuments.css
│   │   │   │   ├── repolinking.css
│   │   │   │   └── settings.css
│   │   │   ├── EditDocument.tsx
│   │   │   ├── LinkGithubRepo.tsx
│   │   │   ├── MyDocuments.tsx
│   │   │   ├── ProgressModal.tsx
│   │   │   ├── SelectDocType.tsx
│   │   │   └── Settings.tsx
│   │   ├── global-css
│   │   │   ├── navbar-signedin.css
│   │   │   └── navbar.css
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── router.tsx
│   │   └── vite-env.d.ts
│   ├── tailwind.config.js
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── figma
│   ├── Linkingithub.png
│   ├── create-your-First-doc.png
│   └── landing_page.png
└── nginx
└── certbot
├── conf
│   └── renewal-hooks
│       ├── deploy
│       ├── post
│       └── pre
└── www

28 directories, 71 files

## Repository
https://github.com/MiguelIbrahimE/echo
