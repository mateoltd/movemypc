import React from 'react';

interface File {
  id: string;
  name: string;
  path: string;
}

interface Props {
  files: File[];
  onSelectionChange: (id: string, checked: boolean) => void;
}

const FileSelector: React.FC<Props> = ({ files, onSelectionChange }) => {
  return (
    <div className="selector">
      <h2>Files</h2>
      <ul>
        {files.map(file => (
          <li key={file.id}>
            <input type="checkbox" id={file.id} onChange={(e) => onSelectionChange(file.id, e.target.checked)} />
            <label htmlFor={file.id}>{file.name}</label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default FileSelector; 