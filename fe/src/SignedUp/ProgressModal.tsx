// fe/src/SignedUp/ProgressModal.tsx
import React, { useState, useEffect } from 'react';

interface ProgressModalProps {
  isVisible: boolean;   // show/hide the modal
  isComplete: boolean;  // jump to 100%?
  onClose?: () => void; // close callback
}

const ProgressModal: React.FC<ProgressModalProps> = ({ isVisible, isComplete, onClose }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      return;
    }
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90 || isComplete) return prev;
        return prev + 5;
      });
    }, 600);
    return () => clearInterval(timer);
  }, [isVisible, isComplete]);

  useEffect(() => {
    if (isComplete) {
      setProgress(100);
    }
  }, [isComplete]);

  if (!isVisible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={{ textAlign: 'center' }}>Generating user manual...</h3>
        <div style={styles.barContainer}>
          <div style={{ ...styles.barFill, width: `${progress}%` }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: '0.5rem' }}>{progress}% complete</p>
        {isComplete && (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button onClick={onClose} style={styles.closeButton}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 9999,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modal: {
    backgroundColor: '#fff',
    padding: '2rem',
    borderRadius: '8px',
    width: '300px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
  },
  barContainer: {
    width: '100%',
    height: '20px',
    backgroundColor: '#ccc',
    borderRadius: '10px',
    overflow: 'hidden',
    marginTop: '1rem'
  },
  barFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    transition: 'width 0.4s ease'
  },
  closeButton: {
    backgroundColor: '#4caf50',
    color: '#fff',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    cursor: 'pointer'
  }
};

export default ProgressModal;
