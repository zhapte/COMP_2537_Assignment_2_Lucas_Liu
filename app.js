require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { MongoClient, ObjectId } = require('mongodb');
const Joi = require('joi');
const bcrypt = require('bcrypt');

const {
    MONGODB_USER,
    MONGODB_PASSWORD,
    MONGODB_HOST,
    MONGODB_DATABASE,
    NODE_SESSION_SECRET,
    PORT = 8000
} = process.env;

const app = express();

const uri = `mongodb+srv://${encodeURIComponent(MONGODB_USER)}`
    + `:${encodeURIComponent(MONGODB_PASSWORD)}`
    + `@${MONGODB_HOST}/${MONGODB_DATABASE}`;


const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const signupSchema = Joi.object({
    name: Joi.string().max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

(async function startServer() {
    try {
        await client.connect();
        const db = client.db(MONGODB_DATABASE);
        const usersCollection = db.collection('users');

        app.use(express.urlencoded({ extended: false }));

        app.use(session({
            secret: NODE_SESSION_SECRET,
            store: MongoStore.create({ client }),
            resave: false,
            saveUninitialized: false,
            cookie: { maxAge: 1000 * 60 * 60 }
        }));

        app.use(express.static('public'));

        app.set('view engine', 'ejs');
        app.set('views', './views');


        app.get('/', (req, res) => {
            if (req.session.userId) {
                return res.redirect('/members');
            }
            res.render('index');
        });

        app.get('/signup', (req, res) => {
            res.render('signup', { error: null, form: {} });
        });

        app.post('/signup', async (req, res) => {
            try {
                const { name, email, password } = await signupSchema.validateAsync(req.body);
                const passwordHash = await bcrypt.hash(password, 10);
                const result = await usersCollection.insertOne({ name, email, passwordHash });
                req.session.userId = result.insertedId.toString();
                res.redirect('/members');

            } catch (err) {
                console.error('Signup error:', err);
                res.status(400).render('signup', { error: errorMessage, form: req.body });
            }
        });

        app.get('/members', async (req, res) => {
            if (!req.session.userId) {
                return res.redirect('/');
            }

            const user = await usersCollection.findOne({
                _id: new ObjectId(req.session.userId)
            });
            if (!user) {
                req.session.destroy();
                return res.redirect('/');
            }

            const images = [
                '/photo1.jpg',
                '/photo2.webp',
                '/photo3.webp'
            ];
            const imagePath = images[Math.floor(Math.random() * images.length)];

            res.render('members', {
                name: user.name,
                imagePath
            });
        });

        app.get('/logout', (req, res) => {
            req.session.destroy(err => {
                if (err) {
                    console.error('Logout error:', err);
                    return res.redirect('/members');
                }
                res.redirect('/');
            });
        });

        app.get('/login', (req, res) => {
            res.render('login', { error: null, form: {} });
        });

        app.post('/login', async (req, res) => {
            try {
                const { email, password } = await loginSchema.validateAsync(req.body);

                const user = await usersCollection.findOne({ email });
                if (!user) {
                    throw new Error('Invalid email or password.');
                }

                const match = await bcrypt.compare(password, user.passwordHash);
                if (!match) {
                    throw new Error('Invalid email or password.');
                }

                // Success: create session & redirect
                req.session.userId = user._id.toString();
                res.redirect('/members');

            } catch (err) {
                const errorMessage = err.isJoi
                    ? err.details[0].message
                    : 'Invalid email or password.';
                res.status(400).render('login', {
                    error: errorMessage,
                    form: { email: req.body.email }
                });
            }
        });

        app.use((req, res) => {
            res.status(404).render('404');
        });

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
})();
