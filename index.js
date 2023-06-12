const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;

// Middleware 
app.use(cors());
app.use(express.json());

/* Verfication start here */
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
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
        // Verify Student
        const verifyStudent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role === 'instructor' || user?.role === 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }


        /* Common */
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
        //Get Instructors for Instructor Page
        app.get('/instructors', async (req, res) => {
            const query = { role: 'instructor' }
            const instructors = await usersCollection.find(query).toArray();
            res.send(instructors);
        })
        /* Common End*/
*
        /* users related apis */
        // User add selected classes for booked and pay
        app.post('/userclasses', verifyJWT, async (req, res) => {
            const item = req.body;
            const result = await userClassCollection.insertOne(item);
            res.send(result);
        })
        // Student dashbord Selected Classes
        app.get('/bookedclass', verifyJWT, verifyStudent, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const decodedEmail = req?.decoded?.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email, paymentStatus: 'booked' };
            const result = await userClassCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/bookedclass/:id', verifyJWT, verifyStudent, async (req, res) => {
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
            const email = req?.params?.email;
            // console.log(email)

            // if (req?.decoded?.email !== email) {
            //     return res.send({ instructor: false })
            // }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            // console.log(result)
            res.send(result);
        })
        // Add Class
        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newItem = req.body;
            const result = await classCollection.insertOne(newItem)
            res.send(result);
        })
        // Instructor added Classes
        app.get('/myclasses', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { instructorEmail: email };
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });


        /* Admin Related Api */
        // check admin
        app.get('/users/admin/checkadmin/:email', verifyJWT, async (req, res) => {
            const email = req?.params?.email;

            // if (req?.decoded?.email !== email) {
            //     return res.send({ admin: false })
            // }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })
        // Update User Role
        app.patch('/users/admin/roleupdate/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const role = req.query.role;
            // console.log(role);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: role
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })
        // Update Class Status
        app.patch('/users/admin/classupdate/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const status = req.query.status;
            console.log(id, status);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: status
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);

        })
        // Add feedback
        app.patch('/users/admin/feedbackupdate/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedback = req.query.feedback;
            console.log(id, feedback);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    feedback: feedback
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);

        })
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });
        app.get('/users/admin/allclass', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        });
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