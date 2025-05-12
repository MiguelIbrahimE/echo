// fe/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from './router'; // Your createBrowserRouter instance

// Import global CSS files here
import './index.css'; // If you have a global index.css for resets, base styles, etc.
import './global-css/navbar.css'; // <--- YOUR GLOBAL NAVBAR STYLES

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>
);