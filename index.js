const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
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
    ,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        client.connect((err) => {
            if (err) {
                console.log(err)
                return;
            }
        });
        /* Works here */
        const usersCollection = client.db("languageDb").collection("users");
        const classCollection = client.db("languageDb").collection("classes");
        const userClassCollection = client.db("languageDb").collection("userclass");
        const paymentCollection = client.db("languageDb").collection("payments");

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
                return res.status(403).send({ error: true, message: 'forbidden access' });
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
        // Popular Classes
        app.get('/popularclass', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classCollection.find(query).sort({ students: -1 }).limit(6).toArray();
            res.send(result);
        });
        // Classes Page api
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
        // Popular Instructors
        app.get('/popularinstructors', async (req, res) => {
            const query = { role: 'instructor' }
            const instructors = await usersCollection.find(query).limit(6).toArray();
            res.send(instructors);
        })

        // All Classes student count and seats after payment
        app.patch('/users/updateapprovedclass/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await classCollection.findOne(query);
            const newSeats = (result?.seats) - 1;
            const newStudents = (result?.students) + 1;
            const updateDoc = {
                $set: {
                    seats: newSeats,
                    students: newStudents
                },
            };

            const insertedresult = await classCollection.updateOne(query, updateDoc);
            res.send(insertedresult);

        })
        /* Common End*/
        /* users related apis */
        // User add selected classes for booked and pay
        app.post('/userclasses', verifyJWT, async (req, res) => {
            const item = req.body;
            const query = { classId: item.classId, email: item.email}
            const exists = await userClassCollection.findOne(query);

            if (exists) {
                return res.send({ message: 'already exists' })
            }

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
        // Student Paid classes
        app.get('/enrolledclasses', verifyJWT, verifyStudent, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { email: email, paymentStatus: 'paid' };
            const result = await userClassCollection.find(query).toArray();
            res.send(result);
        });
        // Delete from Student Selected class
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
            const exists = await usersCollection.findOne(query);

            if (exists) {
                return res.send({ message: 'already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // Update Class Status
        app.patch('/users/student/paidclass/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const paymentStatus = req.query.paymentStatus;
            // console.log(id, status);
            const filter = { _id: new ObjectId(id) };
            const result = await userClassCollection.findOne(filter);
            const newSeats = (result?.seats) - 1;
            const newStudents = (result?.students) + 1;
            const updateDoc = {
                $set: {
                    paymentStatus: paymentStatus,
                    seats: newSeats,
                    students: newStudents
                },
            };
            const updatedResult = await userClassCollection.updateOne(filter, updateDoc);
            res.send(updatedResult);

        })
        // Payment History
        app.get('/paymenthistory', verifyJWT, verifyStudent, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            if (req?.decoded?.email !== email) {
                return res.send({ student: false })
            }
            const query = { email: email }
            const result = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(result);
        });

        /* Instructor related api */
        // check Instructor
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req?.params?.email;
            if (req?.decoded?.email !== email) {
                return res.send({ instructor: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
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
        // Instructor Statistics
        // app.get('/users/instructor/statistics', async (req, res) => {
        //     const allclasses = await classCollection.find().toArray();
        //     const userclasses = await userClassCollection.find().toArray();
        //     const users = await usersCollection.find().toArray();

        //     const totalClasses = allclasses.length;
        //     const totalusersCount = users.length;
        //     const instructorsCount = users.reduce((count, user) => {
        //         if (user.role === "instructor") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);
        //     const studentsCount = users.reduce((count, user) => {
        //         if (user.role !== "instructor" && user.role !== "admin") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);
        //     const paidUserclassesCount = userclasses.reduce((count, userclass) => {
        //         if (userclass.paymentStatus === "paid") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);
        //     const bookedUserclassesCount = userclasses.reduce((count, userclass) => {
        //         if (userclass.paymentStatus === "booked") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);
        //     const approvedClassesCount = allclasses.reduce((count, allclass) => {
        //         if (allclass.status === "approved") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);
        //     const deniedClassesCount = allclasses.reduce((count, allclass) => {
        //         if (allclass.status === "denied") {
        //             return count + 1;
        //         } else {
        //             return count;
        //         }
        //     }, 0);

        //     const stats = { totalClasses, deniedClassesCount, totalusersCount, instructorsCount, studentsCount, approvedClassesCount, paidUserclassesCount, bookedUserclassesCount }
        //     res.send(stats);
        // });

        /* Admin Related Api */
        // check admin
        app.get('/users/admin/checkadmin/:email', verifyJWT, async (req, res) => {
            const email = req?.params?.email;

            if (req?.decoded?.email !== email) {
                return res.send({ admin: false })
            }
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

        // Admin Statistics
        app.get('/users/admin/statistics', verifyJWT, verifyAdmin, async (req, res) => {
            const allclasses = await classCollection.find().toArray();
            const userclasses = await userClassCollection.find().toArray();
            const users = await usersCollection.find().toArray();

            const totalClasses = allclasses.length;
            const totalusersCount = users.length;
            const instructorsCount = users.reduce((count, user) => {
                if (user.role === "instructor") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);
            const studentsCount = users.reduce((count, user) => {
                if (user.role !== "instructor" && user.role !== "admin") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);
            const paidUserclassesCount = userclasses.reduce((count, userclass) => {
                if (userclass.paymentStatus === "paid") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);
            const bookedUserclassesCount = userclasses.reduce((count, userclass) => {
                if (userclass.paymentStatus === "booked") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);
            const approvedClassesCount = allclasses.reduce((count, allclass) => {
                if (allclass.status === "approved") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);
            const deniedClassesCount = allclasses.reduce((count, allclass) => {
                if (allclass.status === "denied") {
                    return count + 1;
                } else {
                    return count;
                }
            }, 0);

            const stats = { totalClasses, deniedClassesCount, totalusersCount, instructorsCount, studentsCount, approvedClassesCount, paidUserclassesCount, bookedUserclassesCount }
            res.send(stats);
        });

        /* Payment Related API */
        // Payment Details
        app.get('/payment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userClassCollection.findOne(query);
            res.send(result);
        })
        // payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
            // console.log(paymentIntent.client_secret)
        })

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
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