import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import LinkGithubRepo from './SignedUp/LinkGithubRepo';
import DocumentPage from './SignedUp/DocumentPage';
import MyDocuments from './SignedUp/MyDocuments';
import MyErrorBoundary from './MyErrorBoundary';
import Settings from './SignedUp/Settings';

const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        errorElement: <MyErrorBoundary />,
    },
    {
        path: '/link-github',
        element: <LinkGithubRepo />,
    },
    {
        /* main doc editor */
        path: '/document-page',
        element: <DocumentPage />,
    },
    {
        /* dashboard */
        path: '/dashboard',
        element: <MyDocuments />,
    },
    {
        /* alias – keeps old /documents URL working */
        path: '/documents',
        element: <MyDocuments />,
    },
    {
     path: '/settings',
        element: <Settings />
    },
]);

export default router;
