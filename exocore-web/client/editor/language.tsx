import { getLanguageIcon } from '../shared/components/IconLanguage';

export const getFileIcon = (filename: string): React.ReactNode => {
    return getLanguageIcon(filename, 14);
};

import React from 'react';
export { getLanguageIcon };
