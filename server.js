const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const uploadPath = path.join(__dirname, 'uploads');
const cors = require('cors');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// Verificar o crear la carpeta 'uploads'
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// Ruta para subir archivos
app.post('/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    const uploadPromises = files.map(file => {
        const uploadFilePath = path.join(uploadPath, file.name);
        return new Promise((resolve, reject) => {
            file.mv(uploadFilePath, err => {
                if (err) return reject(err);
                io.emit('newFile', file.name);
                resolve();
            });
        });
    });

    Promise.all(uploadPromises)
        .then(() => res.send('Files uploaded!'))
        .catch(err => res.status(500).send(err));
});

// Ruta para eliminar archivos
app.post('/delete', (req, res) => {
    const { fileName } = req.body;
    console.log('Solicitud de eliminación:', req.body);

    if (!fileName) {
        console.error('Nombre de archivo no proporcionado');
        return res.status(400).send('Nombre de archivo no proporcionado');
    }

    const filePath = path.join(uploadPath, fileName);
    fs.access(filePath, fs.constants.F_OK, err => {
        if (err) {
            console.error('El archivo no existe:', filePath);
            return res.status(404).send('Archivo no encontrado: ' + fileName);
        }

        fs.unlink(filePath, err => {
            if (err) {
                console.error('Error al eliminar el archivo:', err);
                return res.status(500).send('Error al eliminar el archivo.');
            }
            io.emit('fileDeleted', fileName);
            res.send('Archivo eliminado: ' + fileName);
        });
    });
});

// Ruta para obtener lista de archivos
app.get('/uploads', (req, res) => {
    fs.readdir(uploadPath, (err, files) => {
        if (err) {
            return res.status(500).send('Error al obtener archivos.');
        }
        res.json(files);
    });
});

io.on('connection', socket => {
    socket.on('loadFiles', () => {
        fs.readdir(uploadPath, (err, files) => {
            if (err) {
                console.error('Error al cargar archivos:', err);
                return;
            }
            socket.emit('loadFiles', files.filter(file => /\.(mp4|mov|avi|jpg|jpeg|png|gif)$/.test(file)));
        });
    });

    socket.on('deleteFile', (fileName) => {
        // Emitir evento a todos para que se elimine el archivo
        socket.broadcast.emit('fileDeleted', fileName);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

