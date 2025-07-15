import React from 'react';

interface SelectableItem {
  id: string;
  name: string;
  path?: string; // Optional, for files
}

interface ItemSelectorProps {
  title: string;
  items: SelectableItem[];
  onSelectionChange: (id: string, checked: boolean) => void;
}

const ItemSelector: React.FC<ItemSelectorProps> = ({ title, items, onSelectionChange }) => {
  return (
    <div className="selector">
      <h2>{title}</h2>
      <ul>
        {items.map(item => (
          <li key={item.id}>
            <input 
              type="checkbox" 
              id={item.id} 
              onChange={(e) => onSelectionChange(item.id, e.target.checked)} 
            />
            <label htmlFor={item.id}>{item.name}</label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ItemSelector; 