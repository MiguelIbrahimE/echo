// router.tsx (or your main frontend routing file)
import { createBrowserRouter } from 'react-router-dom'; // Ensure RouterProvider is used in your main.tsx
import App from './App';
import LinkGithubRepo from './SignedUp/LinkGithubRepo';
import EditDocument from './SignedUp/EditDocument';
import MyDocuments from './SignedUp/MyDocuments';
import MyErrorBoundary from './MyErrorBoundary';
import Settings from './SignedUp/Settings';
import SelectDocType from './SignedUp/SelectDocType'; // <--- IMPORT THE NEW COMPONENT

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <MyErrorBoundary />,
    },
    {
        path: '/link-github',
        element: <LinkGithubRepo />,
        errorElement: <MyErrorBoundary />, // Good to have error boundaries on more routes
    },
    {
        /* main doc editor */
        path: '/document-page', // Consider using a param like /document/:docId or /document/:repo/:branch/:docType
        element: <EditDocument />,
        errorElement: <MyErrorBoundary />,
    },
    {
        /* dashboard */
        path: '/dashboard', // It's good to have a consistent primary path
        element: <MyDocuments />,
        errorElement: <MyErrorBoundary />,
    },
    {
        /* alias – keeps old /documents URL working and navigates to dashboard */
        path: '/documents',
        element: <MyDocuments />, // Or navigate to '/dashboard'
        errorElement: <MyErrorBoundary />,
    },
    {
        path: '/settings',
        element: <Settings />,
        errorElement: <MyErrorBoundary />,
    },
    { // <--- ADD THIS NEW ROUTE
        path: '/select-doc-type',
        element: <SelectDocType />,
        errorElement: <MyErrorBoundary />,
    },

]);

export default router;