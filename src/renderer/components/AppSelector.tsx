import React from 'react';

interface App {
  id: string;
  name: string;
}

interface Props {
  apps: App[];
  onSelectionChange: (id: string, checked: boolean) => void;
}

const AppSelector: React.FC<Props> = ({ apps, onSelectionChange }) => {
  return (
    <div className="selector">
      <h2>Applications</h2>
      <ul>
        {apps.map(app => (
          <li key={app.id}>
            <input type="checkbox" id={app.id} onChange={(e) => onSelectionChange(app.id, e.target.checked)} />
            <label htmlFor={app.id}>{app.name}</label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AppSelector; 