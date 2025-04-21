import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Mock for navigate
jest.mock('react-router-dom', () => {
    const actual = jest.requireActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => jest.fn()
    };
});

describe('App component', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renders the landing page title and subtitle', () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );

        expect(screen.getByText(/Ever suffered with/i)).toBeInTheDocument();
        expect(screen.getByText(/Give it another chance/i)).toBeInTheDocument();
    });

    it('shows login modal when "Log In" button is clicked', () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );

        const loginBtn = screen.getByText(/Log In/i);
        fireEvent.click(loginBtn);

        expect(screen.getByText(/Welcome Back!/i)).toBeInTheDocument();
    });

    it('shows signup modal when "Sign Up" button is clicked', () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );

        const signupBtn = screen.getByText(/Sign Up/i);
        fireEvent.click(signupBtn);

        expect(screen.getByText(/Thank You for Thinking of Us/i)).toBeInTheDocument();
    });

    it('validates username input on sign-up', async () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText(/Sign Up/i));

        const usernameInput = screen.getByPlaceholderText(/Your username/i);
        fireEvent.change(usernameInput, { target: { value: '@invalid' } });
        fireEvent.blur(usernameInput);

        await waitFor(() => {
            expect(screen.getByText(/can only contain letters, digits/i)).toBeInTheDocument();
        });
    });

    it('displays password criteria as checkboxes', () => {
        render(
            <MemoryRouter>
                <App />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByText(/Sign Up/i));

        expect(screen.getByText(/Password Criteria:/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/At least 8 characters/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/At least 1 uppercase letter/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/At least 1 number/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/At least 1 special character/i)).toBeInTheDocument();
    });
});
