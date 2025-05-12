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
            res.render('index', {
                title: 'Home',
                authenticated: req.session.authenticated,
                user_type: req.session.user_type
            });
        });

        app.get('/members', async (req, res) => {
            if (!req.session.authenticated) {
                return res.redirect('/');
            }

            const user = await usersCollection.findOne({ _id: new ObjectId(req.session.userId) });

            if (!user) {
                req.session.destroy();
                return res.redirect('/');
            }

            const images = [
                '/photo1.jpg',
                '/photo2.webp',
                '/photo3.webp'
            ];

            res.render('members', {
                title: 'Members Area',
                name: user.name,
                images,
                authenticated: true,
                user_type: user.user_type
            });
        });

        function adminMiddleware(req, res, next) {
            if (!req.session.authenticated) {
                return res.redirect('/login');
            }

            if (req.session.user_type !== 'admin') {
                return res.status(403).render('403', {
                    title: 'Forbidden',
                    error: 'You are not authorized to access this page.',
                    authenticated: req.session.authenticated,
                    user_type: req.session.user_type
                });
            }

            next();
        }

        app.use('/admin', adminMiddleware);

        app.get('/admin', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.render('admin', {
                title: 'Admin Panel',
                users,
                authenticated: true,
                user_type: req.session.user_type
            });
        });

        app.get('/admin/promote/:id', async (req, res) => {
            await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { user_type: 'admin' } }
            );
            res.redirect('/admin');
        });

        app.get('/admin/demote/:id', async (req, res) => {
            await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { user_type: 'user' } }
            );
            res.redirect('/admin');
        });

        app.get('/signup', (req, res) => {
            res.render('signup', {
                title: 'Sign Up',
                error: null,
                form: {},
                authenticated: req.session.authenticated,
                user_type: req.session.user_type
            });
        });

        app.post('/signup', async (req, res) => {
            try {
                const { name, email, password } = await signupSchema.validateAsync(req.body);
                const passwordHash = await bcrypt.hash(password, 10);

                const result = await usersCollection.insertOne({
                    name,
                    email,
                    passwordHash,
                    user_type: 'user'
                });

                req.session.userId = result.insertedId.toString();
                req.session.authenticated = true;
                req.session.name = name;
                req.session.user_type = 'user';

                res.redirect('/members');

            } catch (err) {
                const errorMessage = err.details?.[0]?.message || 'Signup failed.';
                res.status(400).render('signup', {
                    title: 'Sign Up',
                    error: errorMessage,
                    form: req.body,
                    authenticated: req.session.authenticated,
                    user_type: req.session.user_type
                });
            }
        });

        app.get('/login', (req, res) => {
            res.render('login', {
                title: 'Log In',
                error: null,
                form: {},
                authenticated: req.session.authenticated,
                user_type: req.session.user_type
            });
        });

        app.post('/login', async (req, res) => {
            try {
                const { email, password } = await loginSchema.validateAsync(req.body);

                const user = await usersCollection.findOne({ email });

                if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                    throw new Error(); // generic to avoid leaking details
                }

                req.session.userId = user._id.toString();
                req.session.authenticated = true;
                req.session.name = user.name;
                req.session.user_type = user.user_type;

                res.redirect('/members');

            } catch (err) {
                const errorMessage = err.isJoi
                    ? err.details[0].message
                    : 'Invalid email or password.';

                res.status(400).render('login', {
                    title: 'Log In',
                    error: errorMessage,
                    form: { email: req.body.email },
                    authenticated: req.session.authenticated,
                    user_type: req.session.user_type
                });
            }
        });

        app.get('/logout', (req, res) => {
            req.session.destroy(() => {
                res.redirect('/');
            });
        });

        app.use((req, res) => {
            res.status(404).render('404', {
                title: 'Page Not Found',
                authenticated: req.session.authenticated,
                user_type: req.session.user_type
            });
        });

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (err) {
        console.error('Startup error:', err);
        process.exit(1);
    }
})();
