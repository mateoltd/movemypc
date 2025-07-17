import { homedir } from 'os';
import { join } from 'path';

export const getUserDirectories = (): string[] => [
  join(homedir(), 'Documents'),
  join(homedir(), 'Pictures'),
  join(homedir(), 'Videos'),
  join(homedir(), 'Music'),
  join(homedir(), 'Downloads'),
  join(homedir(), 'Desktop'),
  join(homedir(), 'Favorites'),
  join(homedir(), 'Links'),
  homedir(),
  join(homedir(), 'OneDrive'),
  join(homedir(), 'Google Drive'),
  join(homedir(), 'Dropbox'),
  join(homedir(), 'iCloudDrive'),
  join(homedir(), 'Projects'),
  join(homedir(), 'Development'),
  join(homedir(), 'Code'),
  join(homedir(), 'Workspace'),
  join(homedir(), 'Source'),
  join(homedir(), 'AppData', 'Roaming'),
  join(homedir(), 'AppData', 'Local'),
];

export const getApplicationDirectories = (): string[] => [
  join(process.env.PROGRAMFILES || 'C:\\Program Files'),
  join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'),
  join(homedir(), 'AppData', 'Local'),
  join(homedir(), 'AppData', 'Roaming'),
  join(homedir(), 'Applications'),
  join(homedir(), 'Programs'),
  join(homedir(), 'Software'),
  'C:\\PortableApps',
  'C:\\Tools',
  'C:\\Apps',
];

export const getConfigurationDirectories = (): string[] => [
  join(homedir(), 'AppData', 'Roaming'),
  join(homedir(), 'AppData', 'Local'),
  join(homedir(), '.config'),
  join(homedir(), '.ssh'),
  join(homedir(), '.aws'),
  join(homedir(), '.docker'),
  join(homedir(), '.vscode'),
  join(homedir(), '.vs'),
  join(homedir(), '.android'),
  join(homedir(), '.gradle'),
  join(homedir(), '.npm'),
  join(homedir(), '.nuget'),
  join(homedir(), '.gitconfig'),
  homedir(),
]; 