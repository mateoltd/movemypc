import React from 'react';

interface ComputerIconProps {
  className?: string;
}

function ComputerIcon({ className }: ComputerIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H4V5h16v11z" />
    </svg>
  );
}

ComputerIcon.defaultProps = {
  className: '',
};

export default ComputerIcon;
