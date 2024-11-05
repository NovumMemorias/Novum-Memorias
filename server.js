const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Ruta para almacenar los archivos subidos
const uploadPath = path.join(__dirname, 'uploads');

// Verificar o crear la carpeta 'uploads' si no existe
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

app.use(cors());  // CORS habilitado
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());  // Middleware para manejar archivos subidos

// Servir archivos estáticos (como imágenes)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

// Configurar headers de seguridad y eliminar 'interest-cohort'
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self)');
    next();
});

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
                io.emit('newFile', file.name);  // Emitir evento para nuevos archivos
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
    if (!fileName) {
        return res.status(400).send('No file name provided.');
    }

    const filePath = path.join(uploadPath, fileName);
    fs.access(filePath, fs.constants.F_OK, err => {
        if (err) {
            return res.status(404).send('File not found.');
        }

        fs.unlink(filePath, err => {
            if (err) {
                return res.status(500).send('Error deleting file.');
            }
            io.emit('fileDeleted', fileName);  // Emitir evento de archivo eliminado
            res.send(`File deleted: ${fileName}`);
        });
    });
});

// Ruta para obtener la lista de archivos
app.get('/uploads', (req, res) => {
    fs.readdir(uploadPath, (err, files) => {
        if (err) {
            return res.status(500).send('Error reading files.');
        }
        res.json(files);
    });
});

// Configurar Socket.io
io.on('connection', socket => {
    socket.on('loadFiles', () => {
        fs.readdir(uploadPath, (err, files) => {
            if (err) {
                console.error('Error loading files:', err);
                return;
            }
            socket.emit('loadFiles', files.filter(file => /\.(mp4|mov|avi|jpg|jpeg|png|gif)$/.test(file)));
        });
    });

    socket.on('deleteFile', fileName => {
        socket.broadcast.emit('fileDeleted', fileName);  // Emitir evento a otros clientes
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

});
