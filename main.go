package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// MessageType int
const (
	TextMessage   = 1
	BinaryMessage = 2
	CloseMessage  = 8
	PingMessage   = 9
	PongMessage   = 10
)

type Message struct {
	Type int    `json:"type"`
	From string `json:"from"`
	To   string `json:"to"`
	Data []byte `json:"data"`
}

func NewMessage(msg_type int, user string, peer string, data []byte) Message {
	return Message{
		Type: msg_type,
		From: user,
		To:   peer,
		Data: data,
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Room struct {
	mutex       *sync.Mutex
	connections map[string]*websocket.Conn
}

func NewRoom() Room {
	return Room{
		mutex:       &sync.Mutex{},
		connections: map[string]*websocket.Conn{},
	}
}

func (r Room) SendMessage(typ int, msg *Message, msg_bytes []byte) {
	if typ == TextMessage || typ == BinaryMessage {
		r.mutex.Lock()
		defer r.mutex.Unlock()
		if msg.To == "*" {
			for peer, conn := range r.connections {
				if peer != msg.From {
					conn.WriteMessage(typ, msg_bytes)
				}
			}
		} else {
			if _, ok := r.connections[msg.To]; ok {
				r.connections[msg.To].WriteMessage(typ, msg_bytes)
			}
		}
	}
}

var rooms = map[string]Room{}
var rooms_mutex = &sync.Mutex{}

func handle_connection(room_code string, user string) {
	defer func() {
		rooms[room_code].connections[user].Close()
		rooms[room_code].mutex.Lock()
		delete(rooms[room_code].connections, user)
		rooms[room_code].mutex.Unlock()
		rooms_mutex.Lock()
		if len(rooms[room_code].connections) == 0 {
			delete(rooms, room_code)
		}
		rooms_mutex.Unlock()
	}()
	for {
		msg_type, msg_bytes, err := rooms[room_code].connections[user].ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ERROR: %v\n", err)
			}
			return
		}
		new_message := &Message{}
		err = json.Unmarshal(msg_bytes, new_message)
		go rooms[room_code].SendMessage(msg_type, new_message, msg_bytes)
	}
}

func main() {
	router := gin.Default()

	router.Static("/static", "./static")
	router.LoadHTMLGlob("./templates/*.html")

	router.GET("/", func(c *gin.Context) {
		c.HTML(200, "home.html", gin.H{
			"msg": "server online",
		})
	})

	router.GET("/:room_code", func(c *gin.Context) {
		c.HTML(200, "index.html", gin.H{
			"msg": "server online",
		})
	})

	router.GET("/signal/:room_code", func(c *gin.Context) {
		user := c.Query("user")
		if err := uuid.Validate(user); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"msg": "Not a valid UUID",
			})
			return
		}
		upgrader.CheckOrigin = func(r *http.Request) bool { return true }
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.JSON(500, gin.H{
				"msg": "websocket connection failed",
			})
			return
		}
		room_code := c.Param("room_code")
		log.Printf("New connection in room %v: %v", room_code, user)

		rooms_mutex.Lock()
		if _, ok := rooms[room_code]; !ok {
			rooms[room_code] = NewRoom()
		}
		rooms_mutex.Unlock()

		rooms[room_code].mutex.Lock()
		rooms[room_code].connections[user] = conn
		rooms[room_code].mutex.Unlock()
		go handle_connection(room_code, user)
		c.JSON(http.StatusOK, gin.H{
			"msg": "connectioned to websocket",
		})
	})

	exit := make(chan int, 0)
	go func() {
		err := router.Run("localhost:8080")
		if err != nil {
			log.Fatalf("ERROR: listen on port 8080 failed %v", err)
		}
		exit <- 1
	}()
	<-exit
}
