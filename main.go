package main

import (
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	TextMessage   = 1
	BinaryMessage = 2
	CloseMessage  = 8
	PingMessage   = 9
	PongMessage   = 10
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

type Peers struct {
	mutex       *sync.Mutex
	connections map[string]*websocket.Conn
}

var peers = Peers{
	mutex:       &sync.Mutex{},
	connections: map[string]*websocket.Conn{},
}

func Broadcast(user string, typ int, data []byte) {
	if typ == TextMessage || typ == BinaryMessage {
		peers.mutex.Lock()
		defer peers.mutex.Unlock()
		for peer, conn := range peers.connections {
			if user != peer {
				conn.WriteMessage(typ, data)
			}
		}
	}
}

func handle_connection(user string) {
	defer func() {
		peers.connections[user].Close()
		peers.mutex.Lock()
		delete(peers.connections, user)
		peers.mutex.Unlock()
	}()
	for {
		msg_type, msg, err := peers.connections[user].ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ERROR: %v\n", err)
			}
			return
		}
		go Broadcast(user, msg_type, msg)
	}
}

func main() {
	router := gin.Default()

	router.Static("/static", "./static")
	router.LoadHTMLGlob("./templates/*.html")

	router.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"msg": "server online",
		})
	})

	router.GET("/:user", func(c *gin.Context) {
		c.HTML(200, "index.html", gin.H{
			"msg": "server online",
		})
	})

	router.GET("/signal/:user", func(c *gin.Context) {
		upgrader.CheckOrigin = func(r *http.Request) bool { return true }
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			c.JSON(500, gin.H{
				"msg": "websocket connection failed",
			})
			return
		}
		user := c.Param("user")
		log.Printf("New connection: %v", user)
		peers.mutex.Lock()
		peers.connections[user] = conn
		peers.mutex.Unlock()
		go handle_connection(user)
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
