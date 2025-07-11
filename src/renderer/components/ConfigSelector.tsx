import React from 'react';

interface Config {
  id: string;
  name: string;
}

interface Props {
  configs: Config[];
  onSelectionChange: (id: string, checked: boolean) => void;
}

const ConfigSelector: React.FC<Props> = ({ configs, onSelectionChange }) => {
  return (
    <div className="selector">
      <h2>Configurations</h2>
      <ul>
        {configs.map(config => (
          <li key={config.id}>
            <input type="checkbox" id={config.id} onChange={(e) => onSelectionChange(config.id, e.target.checked)} />
            <label htmlFor={config.id}>{config.name}</label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ConfigSelector; 