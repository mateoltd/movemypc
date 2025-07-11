import { homedir } from 'os';
import { join } from 'path';
import * as fs from 'fs';

export const analyzeSystem = async () => {
  const documentsPath = join(homedir(), 'Documents');
  const picturesPath = join(homedir(), 'Pictures');

  const documents = fs.readdirSync(documentsPath).map((name, index) => ({
    id: `file-${index}`,
    name,
    path: join(documentsPath, name),
  }));

  const pictures = fs.readdirSync(picturesPath).map((name, index) => ({
    id: `file-docs-${index}`,
    name,
    path: join(picturesPath, name),
  }));


  return {
    files: [...documents, ...pictures],
    apps: [
      { id: 'app-1', name: 'Google Chrome' },
      { id: 'app-2', name: 'Microsoft Office' },
    ],
    configurations: [
      { id: 'config-1', name: 'Network Settings' },
      { id: 'config-2', name: 'User Preferences' },
    ],
  };
}; 