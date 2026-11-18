import React, { useCallback, useEffect, useState } from 'react';
import { useDialog } from '@/hooks/use-dialog';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogInternalContent,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useTranslation } from 'react-i18next';
import { FileUploader } from '@/components/file-uploader/file-uploader';
import { useStorage } from '@/hooks/use-storage';
import { useNavigate } from 'react-router-dom';
import { diagramFromJSONInput } from '@/lib/export-import-utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/alert/alert';
import { AlertCircle } from 'lucide-react';
import {
    defaultDBMLDiagramName,
    importDBMLToDiagram,
} from '@/lib/dbml/dbml-import/dbml-import';
import { parseDBMLError } from '@/lib/dbml/dbml-import/dbml-import-error';
import { detectDatabaseTypeFromDBML } from '@/lib/dbml/dbml-import/dbml-database-type';
import type { Diagram } from '@/lib/domain/diagram';

const isDBMLFile = (file: File) => file.name.toLowerCase().endsWith('.dbml');

export interface ImportDiagramDialogProps extends BaseDialogProps {}

export const ImportDiagramDialog: React.FC<ImportDiagramDialogProps> = ({
    dialog,
}) => {
    const { t } = useTranslation();
    const [file, setFile] = useState<File | null>(null);
    const { addDiagram } = useStorage();
    const navigate = useNavigate();
    const [error, setError] = useState(false);
    const [dbmlErrorMessage, setDbmlErrorMessage] = useState<string>();

    const onFileChange = useCallback((files: File[]) => {
        if (files.length === 0) {
            setFile(null);
            return;
        }

        setFile(files[0]);
    }, []);

    useEffect(() => {
        if (!dialog.open) return;
        setError(false);
        setDbmlErrorMessage(undefined);
        setFile(null);
    }, [dialog.open]);
    const { closeImportDiagramDialog, closeCreateDiagramDialog } = useDialog();

    const handleImport = useCallback(() => {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result;
            if (typeof text !== 'string') return;

            setError(false);
            setDbmlErrorMessage(undefined);

            try {
                let diagram: Diagram;
                if (isDBMLFile(file)) {
                    try {
                        diagram = await importDBMLToDiagram(text, {
                            databaseType: detectDatabaseTypeFromDBML(text),
                        });
                    } catch (dbmlError) {
                        const parsed = parseDBMLError(dbmlError);
                        setDbmlErrorMessage(
                            parsed
                                ? `Line ${parsed.line}: ${parsed.message}`
                                : dbmlError instanceof Error
                                  ? dbmlError.message
                                  : String(dbmlError)
                        );
                        throw dbmlError;
                    }
                    if (diagram.name === defaultDBMLDiagramName) {
                        diagram.name = file.name.replace(/\.dbml$/i, '');
                    }
                } else {
                    diagram = diagramFromJSONInput(text);
                }

                await addDiagram({ diagram });

                closeImportDiagramDialog();
                closeCreateDiagramDialog();

                navigate(`/diagrams/${diagram.id}`);
            } catch (e) {
                setError(true);

                throw e;
            }
        };
        reader.readAsText(file);
    }, [
        file,
        addDiagram,
        navigate,
        closeImportDiagramDialog,
        closeCreateDiagramDialog,
    ]);

    return (
        <Dialog
            {...dialog}
            onOpenChange={(open) => {
                if (!open) {
                    closeImportDiagramDialog();
                }
            }}
        >
            <DialogContent className="flex max-h-screen flex-col" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {t('import_diagram_dialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('import_diagram_dialog.description')}
                    </DialogDescription>
                </DialogHeader>
                <DialogInternalContent>
                    <div className="flex flex-col p-1">
                        <FileUploader
                            supportedExtensions={['.json', '.dbml']}
                            onFilesChange={onFileChange}
                        />
                        {error ? (
                            <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="size-4" />
                                <AlertTitle>
                                    {t('import_diagram_dialog.error.title')}
                                </AlertTitle>
                                <AlertDescription>
                                    {dbmlErrorMessage
                                        ? `The DBML file couldn't be imported. ${dbmlErrorMessage}`
                                        : t(
                                              'import_diagram_dialog.error.description'
                                          )}
                                </AlertDescription>
                            </Alert>
                        ) : null}
                    </div>
                </DialogInternalContent>
                <DialogFooter className="flex gap-1 md:justify-between">
                    <DialogClose asChild>
                        <Button variant="secondary">
                            {t('import_diagram_dialog.cancel')}
                        </Button>
                    </DialogClose>
                    <Button onClick={handleImport} disabled={file === null}>
                        {t('import_diagram_dialog.import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
