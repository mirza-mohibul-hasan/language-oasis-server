const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// For JWT verification
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}

// Mongo start here
const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.clbkfrr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        /* Works here */
        const usersCollection = client.db("languageDb").collection("users");
        const classCollection = client.db("languageDb").collection("classes");
        const userClassCollection = client.db("languageDb").collection("userclass");

        // JWT Token
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })
        // Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }
        // Verify instructor
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        // Common
        app.get('/popularclass', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classCollection.find(query).sort({ students: -1 }).limit(6).toArray();
            res.send(result);
        });
        app.get('/classes', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });
        // users related apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        // User Selected and Approved Class
        app.post('/userclasses', async (req, res) => {
            const item = req.body;
            const result = await userClassCollection.insertOne(item);
            res.send(result);
        })
        // User Selected Classes
        app.get('/bookedclass', async (req, res) => {
            const email = req.query.email;
            if (!email) {
              res.send([]);
            }
            // const decodedEmail = req?.decoded?.email;
            // if (email !== decodedEmail) {
            //   return res.status(403).send({ error: true, message: 'forbidden access' })
            // }
            const query = { email: email, paymentStatus: 'booked' };
            const result = await userClassCollection.find(query).toArray();
            res.send(result);
          });

          app.delete('/bookedclass/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userClassCollection.deleteOne(query);
            res.send(result);
          })

        // For saving registered user
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        /* Instructor related api */
        // check Instructor
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })
        /* Admin Related Api */
        // check admin
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })
        // Update User Role
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const role = req.query.role;
            console.log(role);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: role
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })
        /* Working zone end */
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);
// Mongo End here

app.get('/', (req, res) => {
    res.send('Language Oasis Server is running')
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})