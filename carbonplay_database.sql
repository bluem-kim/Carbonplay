-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 14, 2025 at 07:45 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `carbonplay`
--

-- --------------------------------------------------------

--
-- Table structure for table `challenges`
--

CREATE TABLE `challenges` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `target_reduction` decimal(10,2) DEFAULT NULL COMMENT 'DEPRECATED: Use challenge_type and target_value instead',
  `target_mode` enum('percent_reduction','absolute_accumulate','absolute_ceiling') DEFAULT 'percent_reduction' COMMENT 'DEPRECATED: Use challenge_type instead',
  `target_value` decimal(10,2) DEFAULT NULL,
  `challenge_type` enum('daily_limit','total_limit','activity_count','consecutive_days') DEFAULT 'daily_limit',
  `target_unit` varchar(50) DEFAULT 'kg_co2e',
  `metric` enum('co2e','quantity') DEFAULT 'co2e' COMMENT 'DEPRECATED: Use target_unit instead',
  `duration_days` int(11) DEFAULT 30,
  `badge_name` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `challenges`
--

INSERT INTO `challenges` (`id`, `name`, `description`, `target_reduction`, `target_mode`, `target_value`, `challenge_type`, `target_unit`, `metric`, `duration_days`, `badge_name`, `is_active`, `created_at`) VALUES
(1, 'Daily car_gasoline Limit', 'Keep your daily car_gasoline emissions under 4.0 kg CO2e', NULL, 'percent_reduction', 4.04, 'daily_limit', 'kg_co2e', 'co2e', 7, 'car_gasoline Saver', 1, '2025-10-23 21:29:30'),
(2, 'Daily beef Limit', 'Keep your daily beef emissions under 270.0 kg CO2e', NULL, 'percent_reduction', 270.00, 'daily_limit', 'kg_co2e', 'co2e', 7, 'beef Saver', 1, '2025-10-23 22:00:01'),
(3, 'Daily chicken Limit', 'Keep your daily chicken emissions under 69.0 kg CO2e', NULL, 'percent_reduction', 69.00, 'daily_limit', 'kg_co2e', 'co2e', 7, 'chicken Saver', 1, '2025-11-01 04:09:41'),
(4, 'Daily beef Limit', 'Keep your daily beef emissions under 270.0 kg CO2e', NULL, 'percent_reduction', 270.00, 'daily_limit', 'kg_co2e', 'co2e', 7, 'beef Saver', 1, '2025-11-07 01:20:56');

-- --------------------------------------------------------

--
-- Table structure for table `challenge_daily_logs`
--

CREATE TABLE `challenge_daily_logs` (
  `id` int(11) NOT NULL,
  `user_challenge_id` int(11) NOT NULL,
  `day_number` int(11) NOT NULL COMMENT '1 to duration_days',
  `log_date` date NOT NULL COMMENT 'Actual calendar date for this day',
  `value_logged` decimal(10,2) DEFAULT NULL COMMENT 'CO2e amount or activity count logged',
  `notes` text DEFAULT NULL,
  `is_completed` tinyint(1) DEFAULT 0,
  `logged_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `challenge_daily_logs`
--

INSERT INTO `challenge_daily_logs` (`id`, `user_challenge_id`, `day_number`, `log_date`, `value_logged`, `notes`, `is_completed`, `logged_at`, `created_at`) VALUES
(1, 1, 1, '2025-10-23', 3.00, NULL, 1, '2025-10-23 21:49:13', '2025-10-23 21:49:13'),
(2, 2, 1, '2025-10-23', 270.00, 'Test', 1, '2025-10-23 22:00:30', '2025-10-23 22:00:30'),
(3, 3, 1, '2025-10-31', 69.00, 'This is my day 1. A perfect day for keeping my emission under the daily goal.', 1, '2025-11-01 04:10:37', '2025-11-01 04:10:37'),
(4, 4, 1, '2025-10-31', 4.00, 'This is my day 1 of limiting my car gasoline.', 1, '2025-11-01 05:00:31', '2025-11-01 05:00:31'),
(5, 5, 1, '2025-11-06', 69.00, 'done', 1, '2025-11-07 00:54:24', '2025-11-07 00:54:24'),
(6, 6, 1, '2025-11-06', 270.00, 'Finished', 1, '2025-11-07 01:21:42', '2025-11-07 01:21:42');

-- --------------------------------------------------------

--
-- Table structure for table `emission_factors`
--

CREATE TABLE `emission_factors` (
  `id` int(11) NOT NULL,
  `category` varchar(50) NOT NULL,
  `activity_type` varchar(100) NOT NULL,
  `region` varchar(50) DEFAULT 'global',
  `co2e_per_unit` decimal(10,6) NOT NULL,
  `unit` varchar(20) NOT NULL,
  `source` varchar(50) DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `emission_factors`
--

INSERT INTO `emission_factors` (`id`, `category`, `activity_type`, `region`, `co2e_per_unit`, `unit`, `source`, `last_updated`) VALUES
(1, 'transport', 'car_gasoline', 'US', 0.404000, 'kg_per_mile', 'climatiq', '2025-10-02 21:52:57'),
(2, 'transport', 'bus', 'US', 0.089000, 'kg_per_mile', 'climatiq', '2025-10-02 21:52:57'),
(3, 'transport', 'bicycle', 'global', 0.000000, 'kg_per_mile', 'manual', '2025-10-02 21:52:57'),
(4, 'diet', 'beef', 'global', 27.000000, 'kg_per_kg', 'coolclimate', '2025-10-02 21:52:57'),
(5, 'diet', 'chicken', 'global', 6.900000, 'kg_per_kg', 'coolclimate', '2025-10-02 21:52:57'),
(6, 'diet', 'vegetables', 'global', 2.000000, 'kg_per_kg', 'coolclimate', '2025-10-02 21:52:57'),
(7, 'energy', 'electricity', 'US', 0.385000, 'kg_per_kwh', 'climatiq', '2025-10-02 21:52:57');

-- --------------------------------------------------------

--
-- Table structure for table `scenarios`
--

CREATE TABLE `scenarios` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `total_co2e` decimal(10,2) DEFAULT 0.00,
  `vs_baseline` decimal(10,2) DEFAULT 0.00,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `scenarios`
--

INSERT INTO `scenarios` (`id`, `user_id`, `name`, `description`, `total_co2e`, `vs_baseline`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 'Test', 'Test', 0.00, 0.00, 0, '2025-10-23 21:19:48', '2025-10-23 21:28:32'),
(2, 3, 'Car', 'Car', 0.81, 0.00, 1, '2025-10-23 21:28:04', '2025-10-23 21:28:08'),
(3, 1, 'Meat', 'meat', 54.00, 0.00, 1, '2025-10-23 21:28:39', '2025-10-23 21:28:50'),
(4, 1, 'Biking', 'This is me Biking', 0.05, 0.00, 1, '2025-11-01 04:05:41', '2025-11-01 04:05:51'),
(5, 1, 'Train', 'This is me riding a train', 0.90, 0.00, 1, '2025-11-01 04:06:02', '2025-11-01 04:06:12'),
(6, 1, 'My Diesel Consumption', 'This is for tracking my diesel consumption', 8.08, 0.00, 1, '2025-11-01 04:06:31', '2025-11-01 04:06:40'),
(7, 3, 'Electricity', 'Test Electricity', 7.70, 0.00, 1, '2025-11-01 04:23:14', '2025-11-01 04:23:24'),
(8, 7, 'Gasoline', 'My gasoline carbon emission scenario.', 10.10, 0.00, 1, '2025-11-01 04:58:35', '2025-11-01 04:58:46'),
(9, 7, 'Electricity', 'My electricity carbon emission scenario.', 11.55, 0.00, 1, '2025-11-01 05:02:40', '2025-11-01 05:02:46'),
(10, 8, 'Train', 'This is for my train carbon emission', 1.13, 0.00, 1, '2025-11-07 00:52:25', '2025-11-07 00:52:32'),
(11, 1, 'Electric Scene', 'Power', 10.60, 0.00, 1, '2025-11-07 01:01:14', '2025-11-07 01:01:26'),
(12, 9, 'Train', 'Sumakay ako ng LRT', 0.90, 0.00, 1, '2025-11-07 01:15:17', '2025-11-07 01:15:51'),
(13, 1, 'Test Scenario Units', 'Test', 3.64, 0.00, 1, '2025-11-14 02:32:54', '2025-11-14 02:40:01');

-- --------------------------------------------------------

--
-- Table structure for table `scenario_activities`
--

CREATE TABLE `scenario_activities` (
  `id` int(11) NOT NULL,
  `scenario_id` int(11) NOT NULL,
  `category` enum('transport','diet','energy','waste','other') NOT NULL,
  `activity_type` varchar(100) NOT NULL,
  `value` decimal(10,2) NOT NULL,
  `unit` varchar(20) NOT NULL,
  `co2e_amount` decimal(10,2) NOT NULL,
  `api_source` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `finished_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `scenario_activities`
--

INSERT INTO `scenario_activities` (`id`, `scenario_id`, `category`, `activity_type`, `value`, `unit`, `co2e_amount`, `api_source`, `created_at`, `finished_at`) VALUES
(1, 2, 'transport', 'car_gasoline', 2.00, 'miles', 0.81, 'default', '2025-10-23 21:28:08', NULL),
(2, 3, 'diet', 'beef', 2.00, 'kg', 54.00, 'coolclimate', '2025-10-23 21:28:50', NULL),
(3, 4, 'transport', 'bicycle', 2.00, 'miles', 0.05, 'default', '2025-11-01 04:05:51', NULL),
(4, 5, 'transport', 'train', 20.00, 'miles', 0.90, 'default', '2025-11-01 04:06:12', NULL),
(5, 6, 'transport', 'car_gasoline', 20.00, 'miles', 8.08, 'default', '2025-11-01 04:06:40', NULL),
(6, 7, 'energy', 'electricity', 20.00, 'kwh', 7.70, 'default', '2025-11-01 04:23:24', NULL),
(7, 8, 'transport', 'car_gasoline', 25.00, 'miles', 10.10, 'default', '2025-11-01 04:58:46', NULL),
(8, 9, 'energy', 'electricity', 30.00, 'kwh', 11.55, 'default', '2025-11-01 05:02:46', NULL),
(9, 10, 'transport', 'train', 25.00, 'miles', 1.13, 'default', '2025-11-07 00:52:32', '2025-11-07 00:52:34'),
(10, 11, 'energy', 'natural_gas', 2.00, 'therms', 10.60, 'default', '2025-11-07 01:01:26', '2025-11-07 01:01:28'),
(11, 12, 'transport', 'train', 20.00, 'miles', 0.90, 'default', '2025-11-07 01:15:51', '2025-11-07 01:15:54'),
(12, 13, 'transport', 'flight_domestic', 23.00, 'km', 3.64, 'default', '2025-11-14 02:40:01', '2025-11-14 02:40:03');

-- --------------------------------------------------------

--
-- Table structure for table `social_likes`
--

CREATE TABLE `social_likes` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `milestone_user_id` int(11) NOT NULL COMMENT 'User whose milestone is being liked',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `social_tips`
--

CREATE TABLE `social_tips` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `content` text NOT NULL,
  `tip_type` enum('general','transport','diet','energy','waste') DEFAULT 'general',
  `likes_count` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `social_tips`
--

INSERT INTO `social_tips` (`id`, `user_id`, `content`, `tip_type`, `likes_count`, `created_at`, `updated_at`) VALUES
(1, 1, 'I love carbon reduction!', 'general', 0, '2025-10-23 22:02:25', '2025-10-23 22:02:25'),
(2, 1, 'Keep it efficient', 'energy', 0, '2025-11-01 01:05:09', '2025-11-01 01:05:09'),
(3, 1, 'I recommend biking than using a car!', 'transport', 0, '2025-11-01 04:11:33', '2025-11-01 04:11:33'),
(4, 7, 'I suggest eating less meat and focus on eating vegies!', 'general', 0, '2025-11-01 05:01:15', '2025-11-07 01:25:07'),
(5, 9, 'This is my first post', 'general', 0, '2025-11-07 01:25:39', '2025-11-07 01:25:39');

-- --------------------------------------------------------

--
-- Table structure for table `social_tip_likes`
--

CREATE TABLE `social_tip_likes` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `tip_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0 COMMENT '0 = not verified, 1 = verified',
  `role` enum('user','admin') NOT NULL DEFAULT 'user',
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `password_hash`, `email_verified`, `role`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'UserTest', 'kimjensenyebes@gmail.com', '$2b$10$k5Fk5UT7L7Vtd8JO7IY2p.iUMp6RWxhjDDJgrNOcp3Yb1Fcrw8o1W', 1, 'admin', 1, '2025-10-02 22:00:56', '2025-11-14 00:56:44'),
(2, 'maria_labi58', 'emlabi@gmail.com', '$2b$10$0u1A6nd3jesBTuH6pCMI6e1wbv1Npt0IYVp3/WZycVc1GR4rICNP.', 0, 'user', 1, '2025-10-17 18:34:47', '2025-10-17 18:34:47'),
(3, 'second_acc69', 'secondacc@gmail.com', '$2b$10$ODyjeUuThUJW1kl75wU2zuA0ZdG5.rP.6uesbW8nZ/PIZ6sWrAqIO', 0, 'user', 1, '2025-10-23 21:27:52', '2025-10-23 21:27:52'),
(4, 'third_account80', 'thirdaccount@gmail.com', '$2b$10$12AAE8OgtlTCmYFS3gFeNOWhfuZvy/JBDOtJN7bEJuhUYgJwlq0MO', 0, 'user', 1, '2025-10-23 22:55:00', '2025-10-23 22:55:00'),
(7, 'twilv_reson45', 'testdemoacc@gmail.com', '$2b$10$3yvaybdS4HdlCHU7.tg7sOCcZ5torlWzxcR903YIvnYLR26ZUJI3S', 0, 'user', 1, '2025-11-01 04:57:47', '2025-11-01 04:57:47'),
(8, 'mofu_aoi91', 'mofuuaoi@gmail.com', '$2b$10$cX4qkK9HwIsoT.4dslTx8.qqnC2gco.WSxw3bUo4ECzAhRssrPhuK', 0, 'user', 1, '2025-11-07 00:49:28', '2025-11-07 00:49:28'),
(9, 'kim jensen_yebes34', 'kimjensenyebesaltacc@gmail.com', '$2b$10$BSnV6a.D4jhN2YuxKz8Vsefw3UhMyT4LRZp6WAzLEOzabYr.NVJJi', 0, 'user', 1, '2025-11-07 01:13:31', '2025-11-07 01:13:31'),
(10, 'test_testa29', 'labilabikim13@gmail.com', '$2b$10$0PJcDhsgeDlbqZP3Bm4cR.c5YUFoUj2pLcZS.BAhNOQyIttZNekuq', 1, 'admin', 1, '2025-11-14 00:54:52', '2025-11-14 00:56:33');

-- --------------------------------------------------------

--
-- Table structure for table `user_challenges`
--

CREATE TABLE `user_challenges` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `challenge_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `starting_co2e` decimal(10,2) DEFAULT NULL,
  `current_co2e` decimal(10,2) DEFAULT NULL,
  `completed` tinyint(1) DEFAULT 0,
  `scope_type` enum('all','scenario','category','activity') DEFAULT 'all',
  `scope_ref_id` int(11) DEFAULT NULL,
  `scope_value` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `current_day` int(11) DEFAULT 1 COMMENT 'Current unlocked day (1 to duration_days)',
  `last_log_date` date DEFAULT NULL COMMENT 'Last date user logged data',
  `total_progress` decimal(10,2) DEFAULT 0.00 COMMENT 'Total value logged across all days',
  `days_completed` int(11) DEFAULT 0 COMMENT 'Number of days completed'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_challenges`
--

INSERT INTO `user_challenges` (`id`, `user_id`, `challenge_id`, `start_date`, `end_date`, `starting_co2e`, `current_co2e`, `completed`, `scope_type`, `scope_ref_id`, `scope_value`, `created_at`, `current_day`, `last_log_date`, `total_progress`, `days_completed`) VALUES
(1, 1, 1, '2025-10-24', NULL, 0.00, 0.00, 0, 'all', NULL, NULL, '2025-10-23 21:37:57', 1, '2025-10-24', 3.00, 1),
(2, 1, 2, '2025-10-24', NULL, 0.00, 0.00, 0, 'all', NULL, NULL, '2025-10-23 22:00:07', 1, '2025-10-24', 270.00, 1),
(3, 1, 3, '2025-11-01', NULL, 0.00, 0.00, 0, 'all', NULL, NULL, '2025-11-01 04:10:00', 1, '2025-11-01', 69.00, 1),
(4, 7, 1, '2025-11-01', NULL, 0.00, 0.00, 0, 'all', NULL, NULL, '2025-11-01 05:00:04', 1, '2025-11-01', 4.00, 1),
(5, 8, 3, '2025-11-07', '2025-11-07', 0.00, 0.00, 1, 'all', NULL, NULL, '2025-11-07 00:54:11', 1, '2025-11-07', 69.00, 7),
(6, 9, 4, '2025-11-07', NULL, 0.00, 0.00, 0, 'all', NULL, NULL, '2025-11-07 01:21:07', 1, '2025-11-07', 270.00, 1),
(7, 9, 3, '2025-11-07', '2025-11-07', 0.00, 0.00, 1, 'all', NULL, NULL, '2025-11-07 01:22:50', 1, NULL, 0.00, 7);

-- --------------------------------------------------------

--
-- Table structure for table `user_profiles`
--

CREATE TABLE `user_profiles` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `country` varchar(50) DEFAULT 'US',
  `household_size` int(11) DEFAULT 1,
  `baseline_calculated` tinyint(1) DEFAULT 0,
  `baseline_co2e` decimal(10,2) DEFAULT 0.00,
  `profile_picture` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_profiles`
--

INSERT INTO `user_profiles` (`id`, `user_id`, `country`, `household_size`, `baseline_calculated`, `baseline_co2e`, `profile_picture`, `created_at`, `updated_at`) VALUES
(1, 1, 'US', 1, 0, 0.00, '/uploads/profiles/profilePicture-1761969754177-440232287.jpg', '2025-10-02 22:00:56', '2025-11-01 04:02:34'),
(2, 2, 'US', 1, 0, 0.00, NULL, '2025-10-17 18:34:47', '2025-10-17 18:34:47'),
(3, 3, 'US', 1, 0, 0.00, '/uploads/profiles/profilePicture-1761969848479-755051676.jpg', '2025-10-23 21:27:52', '2025-11-01 04:04:08'),
(4, 4, 'US', 1, 0, 0.00, NULL, '2025-10-23 22:55:00', '2025-10-23 22:55:00'),
(7, 7, 'PH', 1, 0, 0.00, '/uploads/profiles/profilePicture-1761973091419-87625870.png', '2025-11-01 04:57:47', '2025-11-01 05:01:45'),
(8, 8, 'US', 1, 1, 1.13, '/uploads/profiles/profilePicture-1762476803544-263036957.jpg', '2025-11-07 00:49:28', '2025-11-07 01:30:25'),
(9, 9, 'US', 1, 1, 0.90, NULL, '2025-11-07 01:13:31', '2025-11-07 01:30:33'),
(10, 10, 'US', 1, 0, 0.00, NULL, '2025-11-14 00:54:52', '2025-11-14 00:54:52');

-- --------------------------------------------------------

--
-- Table structure for table `user_xp`
--

CREATE TABLE `user_xp` (
  `user_id` int(11) NOT NULL,
  `xp_total` int(11) NOT NULL DEFAULT 0,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_xp`
--

INSERT INTO `user_xp` (`user_id`, `xp_total`, `last_updated`) VALUES
(1, 124, '2025-11-01 04:10:37'),
(7, 52, '2025-11-01 05:00:31'),
(8, 52, '2025-11-07 00:54:24'),
(9, 62, '2025-11-07 01:22:50');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `challenges`
--
ALTER TABLE `challenges`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `challenge_daily_logs`
--
ALTER TABLE `challenge_daily_logs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_challenge_day` (`user_challenge_id`,`day_number`),
  ADD KEY `idx_user_challenge` (`user_challenge_id`),
  ADD KEY `idx_log_date` (`log_date`),
  ADD KEY `idx_challenge_day` (`user_challenge_id`,`day_number`),
  ADD KEY `idx_completion` (`user_challenge_id`,`is_completed`);

--
-- Indexes for table `emission_factors`
--
ALTER TABLE `emission_factors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_factor` (`category`,`activity_type`,`region`);

--
-- Indexes for table `scenarios`
--
ALTER TABLE `scenarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_active` (`user_id`,`is_active`);

--
-- Indexes for table `scenario_activities`
--
ALTER TABLE `scenario_activities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_scenario_category` (`scenario_id`,`category`);

--
-- Indexes for table `social_likes`
--
ALTER TABLE `social_likes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_like` (`user_id`,`milestone_user_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `milestone_user_id` (`milestone_user_id`);

--
-- Indexes for table `social_tips`
--
ALTER TABLE `social_tips`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indexes for table `social_tip_likes`
--
ALTER TABLE `social_tip_likes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_tip_like` (`user_id`,`tip_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `tip_id` (`tip_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_role` (`role`);

--
-- Indexes for table `user_challenges`
--
ALTER TABLE `user_challenges`
  ADD PRIMARY KEY (`id`),
  ADD KEY `challenge_id` (`challenge_id`),
  ADD KEY `idx_user_active` (`user_id`,`completed`),
  ADD KEY `idx_scope` (`scope_type`,`scope_ref_id`);

--
-- Indexes for table `user_profiles`
--
ALTER TABLE `user_profiles`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `user_xp`
--
ALTER TABLE `user_xp`
  ADD PRIMARY KEY (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `challenges`
--
ALTER TABLE `challenges`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `challenge_daily_logs`
--
ALTER TABLE `challenge_daily_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `emission_factors`
--
ALTER TABLE `emission_factors`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `scenarios`
--
ALTER TABLE `scenarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `scenario_activities`
--
ALTER TABLE `scenario_activities`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `social_likes`
--
ALTER TABLE `social_likes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `social_tips`
--
ALTER TABLE `social_tips`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `social_tip_likes`
--
ALTER TABLE `social_tip_likes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `user_challenges`
--
ALTER TABLE `user_challenges`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `user_profiles`
--
ALTER TABLE `user_profiles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `challenge_daily_logs`
--
ALTER TABLE `challenge_daily_logs`
  ADD CONSTRAINT `fk_challenge_daily_user_challenge` FOREIGN KEY (`user_challenge_id`) REFERENCES `user_challenges` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `scenarios`
--
ALTER TABLE `scenarios`
  ADD CONSTRAINT `scenarios_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `scenario_activities`
--
ALTER TABLE `scenario_activities`
  ADD CONSTRAINT `scenario_activities_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `scenarios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `social_likes`
--
ALTER TABLE `social_likes`
  ADD CONSTRAINT `social_likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `social_likes_ibfk_2` FOREIGN KEY (`milestone_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `social_tips`
--
ALTER TABLE `social_tips`
  ADD CONSTRAINT `social_tips_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `social_tip_likes`
--
ALTER TABLE `social_tip_likes`
  ADD CONSTRAINT `social_tip_likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `social_tip_likes_ibfk_2` FOREIGN KEY (`tip_id`) REFERENCES `social_tips` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_challenges`
--
ALTER TABLE `user_challenges`
  ADD CONSTRAINT `user_challenges_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_challenges_ibfk_2` FOREIGN KEY (`challenge_id`) REFERENCES `challenges` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_profiles`
--
ALTER TABLE `user_profiles`
  ADD CONSTRAINT `user_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_xp`
--
ALTER TABLE `user_xp`
  ADD CONSTRAINT `user_xp_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
