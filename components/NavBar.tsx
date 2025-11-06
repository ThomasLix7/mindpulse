"use client";

import {
  Box,
  Flex,
  Heading,
  Spacer,
  Button,
  HStack,
  Text,
  Container,
} from "@chakra-ui/react";
import { useColorMode, ColorModeButton } from "./ui/color-mode";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { getCurrentUser, signOut, supabase } from "@/utils/supabase-client";
import { useRouter } from "next/navigation";

export function NavBar() {
  const { colorMode } = useColorMode();
  const [user, setUser] = useState<any>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const checkAuth = async () => {
    try {
      const { user, error } = await getCurrentUser();
      if (error) {
        console.error("Auth check error:", error);
        setUser(null);
        return;
      }
      setUser(user);
    } catch (err) {
      console.error("Auth check failed:", err);
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isUserMenuOpen &&
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const handleLogin = () => {
    router.push("/login");
  };

  const handleSignup = () => {
    router.push("/signup");
  };

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        console.error("Sign out error:", error);
        return;
      }

      setUser(null);
      setIsUserMenuOpen(false);
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getUserDisplayName = () => {
    if (!user) return "";
    const username =
      user.user_metadata?.name ||
      user.user_metadata?.username ||
      user.email.split("@")[0];

    return username;
  };

  return (
    <Box
      as="nav"
      bg={colorMode === "dark" ? "gray.800" : "white"}
      py={3}
      h="64px"
      shadow="md"
      position="sticky"
      top="0"
      zIndex="sticky"
    >
      <Container maxW="container.xl">
        <Flex alignItems="center">
          <Link href="/" passHref>
            <Heading as="h1" size="md" cursor="pointer">
              Tutor360
            </Heading>
          </Link>

          <Spacer />

          <HStack gap={4}>
            <Link href="/longterm-memories" passHref>
              <Button variant="ghost" size="sm">
                Memories
              </Button>
            </Link>
            {user ? (
              <Box position="relative">
                <Button
                  ref={buttonRef}
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                >
                  <Flex align="center" gap={2}>
                    <Box
                      bg="blue.500"
                      borderRadius="full"
                      color="white"
                      w="24px"
                      h="24px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      fontSize="xs"
                      fontWeight="bold"
                    >
                      {getUserDisplayName().charAt(0).toUpperCase()}
                    </Box>
                    <Text>{getUserDisplayName()}</Text>
                  </Flex>
                </Button>

                {isUserMenuOpen && (
                  <Box
                    ref={menuRef}
                    position="absolute"
                    right="0"
                    top="100%"
                    mt="2"
                    w="200px"
                    bg={colorMode === "dark" ? "gray.800" : "white"}
                    borderWidth="1px"
                    borderRadius="md"
                    shadow="md"
                    zIndex="dropdown"
                  >
                    <Box p={3} borderBottomWidth="1px">
                      <Text fontSize="xs" color="gray.500">
                        {user.email}
                      </Text>
                    </Box>
                    <Box
                      as="button"
                      w="100%"
                      textAlign="left"
                      p={3}
                      _hover={{
                        bg: colorMode === "dark" ? "gray.700" : "gray.100",
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        handleLogout();
                      }}
                    >
                      Sign Out
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleLogin}>
                  Sign In
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignup}>
                  Sign Up
                </Button>
              </>
            )}
            <Text fontSize="xs" color="gray.500">
              v0.1.0
            </Text>
            <ColorModeButton />
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}
